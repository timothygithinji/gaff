/**
 * Worker-compatible Zyte client.
 *
 * The verify scripts under `scripts/verify/lib/zyte.ts` use Bun globals
 * (`performance.now`, `console.log`) which are fine for one-shot
 * smoke-test scripts but we need a leaner version that runs inside
 * workerd (Cloudflare Workers + Trigger.dev v4 task code). This module
 * uses only `fetch`, `btoa`, `atob`, `TextDecoder`, and `Uint8Array` —
 * all available in workerd.
 *
 * Two response modes:
 *
 *   - `browserHtml: true` — Zyte runs a real browser. Required for JS-
 *     heavy portals (Rightmove + Zoopla rely on this to bypass CF /
 *     hydrate __NEXT_DATA__).
 *   - `httpResponseBody: true` — plain HTTP fetch. Cheaper. Works for
 *     OpenRent which renders server-side HTML.
 *
 * Auth is HTTP Basic with the API key as the user and an empty
 * password, per Zyte's REST API conventions.
 */

const ZYTE_ENDPOINT = "https://api.zyte.com/v1/extract";

export type ZyteFetchInput = {
  apiKey: string;
  url: string;
  /** Two-letter ISO country code. Defaults to GB for our UK rental flow. */
  geolocation?: "GB" | string;
  /** Pull the response body via plain HTTP. Cheapest tier. */
  httpResponseBody?: boolean;
  /** Render the URL in a real browser. Required for JS-heavy portals. */
  browserHtml?: boolean;
  /**
   * Invoked before each backoff sleep when a retryable response (429/503/520)
   * comes back, so callers can log the wait. Optional — the retry is
   * transparent either way.
   */
  onRetry?: (info: { status: number; attempt: number; waitMs: number }) => void;
};

/**
 * Zyte rate-limits by requests-per-MINUTE (not concurrency) and, when
 * exceeded, returns HTTP 429 with no `Retry-After` header; its guidance is to
 * retry with exponential backoff + jitter. 503 (overload) and 520 (transient
 * ban) are likewise temporary. We retry these in-process so a brief burst
 * waits it out instead of failing the task. The backoff ceiling is kept low
 * enough that the worst-case total wait fits inside `scrape-detail`'s 120s
 * `maxDuration`.
 */
const ZYTE_RETRYABLE_STATUS = new Set([429, 503, 520]);
const ZYTE_MAX_ATTEMPTS = 5;

function zyteBackoffMs(attempt: number): number {
  // 3s, 6s, 12s, 24s capped at 30s, plus up to 1s jitter to de-sync callers.
  const base = Math.min(3000 * 2 ** (attempt - 1), 30_000);
  return base + Math.floor(Math.random() * 1000);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type ZyteFetchResult = {
  html: string;
  statusCode: number;
  /** Cost as reported by Zyte's `zyte-request-cost` header, in USD. */
  cost?: number;
};

type ZyteApiRequest = {
  url: string;
  httpResponseBody?: boolean;
  httpResponseHeaders?: boolean;
  browserHtml?: boolean;
  geolocation?: string;
};

type ZyteApiResponse = {
  url: string;
  statusCode?: number;
  /** Base64-encoded body when `httpResponseBody: true`. */
  httpResponseBody?: string;
  httpResponseHeaders?: { name: string; value: string }[];
  /** Already-decoded UTF-8 string when `browserHtml: true`. */
  browserHtml?: string;
};

function basicAuth(apiKey: string): string {
  // Zyte expects `<API_KEY>:` (empty password). HTTP Basic = base64 of that.
  return `Basic ${btoa(`${apiKey}:`)}`;
}

function decodeBase64(base64: string): string {
  // workerd has both atob and TextDecoder; this round-trip turns Zyte's
  // base64-encoded body bytes into a UTF-8 string.
  return new TextDecoder().decode(
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  );
}

/**
 * POST to Zyte's `/v1/extract` endpoint and return the page HTML plus
 * the cost Zyte charged us (best-effort — header may be absent on some
 * responses, in which case `cost` is undefined and callers should fall
 * back to a per-portal default).
 *
 * Throws if the request is non-2xx or if neither `browserHtml` nor
 * `httpResponseBody` come back populated.
 */
export async function zyteFetch(
  input: ZyteFetchInput
): Promise<ZyteFetchResult> {
  const body: ZyteApiRequest = {
    url: input.url,
    geolocation: input.geolocation ?? "GB",
  };
  if (input.browserHtml) {
    body.browserHtml = true;
  }
  if (input.httpResponseBody) {
    body.httpResponseBody = true;
    body.httpResponseHeaders = true;
  }

  let res: Response | undefined;
  for (let attempt = 1; attempt <= ZYTE_MAX_ATTEMPTS; attempt++) {
    res = await fetch(ZYTE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: basicAuth(input.apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      break;
    }

    // Retryable rate-limit / overload / transient-ban: back off and retry.
    // Anything else (400/401/422/…) is permanent — fail immediately.
    if (ZYTE_RETRYABLE_STATUS.has(res.status) && attempt < ZYTE_MAX_ATTEMPTS) {
      const waitMs = zyteBackoffMs(attempt);
      input.onRetry?.({ status: res.status, attempt, waitMs });
      await sleep(waitMs);
      continue;
    }

    const errBody = await res.text();
    throw new Error(
      `Zyte ${res.status} ${res.statusText}: ${errBody.slice(0, 400)}`
    );
  }

  // Unreachable in practice (the loop returns or throws), but narrows the type.
  if (!res) {
    throw new Error("Zyte: request loop produced no response");
  }

  const data = (await res.json()) as ZyteApiResponse;

  let html = "";
  if (typeof data.browserHtml === "string") {
    html = data.browserHtml;
  } else if (typeof data.httpResponseBody === "string") {
    html = decodeBase64(data.httpResponseBody);
  } else {
    throw new Error(
      "Zyte response carried neither browserHtml nor httpResponseBody"
    );
  }

  const costHeader = res.headers.get("zyte-request-cost");
  const parsedCost = costHeader ? Number.parseFloat(costHeader) : Number.NaN;
  const cost = Number.isFinite(parsedCost) ? parsedCost : undefined;

  return {
    html,
    statusCode: data.statusCode ?? res.status,
    cost,
  };
}

/**
 * Per-portal cost estimates in USD per page. Used when Zyte doesn't
 * surface a usable `zyte-request-cost` header (it isn't always present)
 * so that `scrape_runs.cost_usd` still records something defensible.
 *
 * Numbers cross-checked against the live verify scripts in
 * `scripts/verify/zyte-*.ts` — all three portals now use the browser
 * tier (~$0.0008/page). OpenRent moved off the cheaper plain-HTTP fetch
 * because its search filters only apply client-side in JS (see
 * `openrentSearchUrl` + `scrape-portal.ts`).
 */
export const PORTAL_COST_USD = {
  rightmove: 0.0008,
  zoopla: 0.0008,
  openrent: 0.0008,
} as const;
