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
};

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

  const res = await fetch(ZYTE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(input.apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Zyte ${res.status} ${res.statusText}: ${errBody.slice(0, 400)}`
    );
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
 * `scripts/verify/zyte-*.ts` — Rightmove and Zoopla require the browser
 * tier (~$0.0008/page), OpenRent works with plain HTTP fetch
 * (~$0.0004/page).
 */
export const PORTAL_COST_USD = {
  rightmove: 0.0008,
  zoopla: 0.0008,
  openrent: 0.0004,
} as const;
