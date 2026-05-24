/**
 * Raw-HTML archival to R2.
 *
 * Every successful Zyte fetch in `scrape-portal.ts` / `scrape-detail.ts`
 * pipes its HTML through here. We gzip in-memory (workerd + Node both
 * ship `CompressionStream`) and PUT to the shared photo bucket under a
 * `raw-html/` prefix. The resulting key is written onto
 * `scrape_runs.raw_key` so future parser improvements can backfill new
 * columns without re-spending Zyte.
 *
 * Failure path: every error is swallowed and logged at the call site.
 * The scrape run still succeeds — raw archival is best-effort, never
 * load-bearing.
 */

import { gzipSync } from "node:zlib";
import { env } from "./env";
import { r2Put } from "./r2-s3";

// `node:zlib.gzipSync` is universal across the Trigger.dev Node worker
// runtime (and Bun for local probes). The Web Streams `CompressionStream`
// alternative isn't reliably present: Node 20.x doesn't expose it as a
// global, Bun's `node:stream/web` lists it but exports `undefined`, and
// only workerd / Node 21+ have it. Raw-html.ts is imported only from
// Trigger tasks, which never run in workerd, so the node: dep is safe.

export type StoreRawHtmlInput = {
  portal: string;
  /** Disambiguator under the portal — search outcode for portal-tier scrapes, listing id for detail-tier. */
  scope: string;
  /** `ctx.run.id` from the Trigger task — matches `scrape_runs.id`. */
  runId: string;
  html: string;
};

export type StoreRawHtmlResult = {
  /** R2 object key, ready to write to `scrape_runs.raw_key`. */
  key: string;
  /** Compressed body size in bytes (useful for telemetry). */
  gzipBytes: number;
};

/**
 * Gzip + upload a single HTML payload. Returns the resulting R2 key, or
 * `null` when R2 creds aren't staged. Throws on transport errors so the
 * caller can decide whether to swallow them (we currently do).
 */
export async function storeRawHtml(
  input: StoreRawHtmlInput
): Promise<StoreRawHtmlResult | null> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    env();
  if (
    !(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)
  ) {
    return null;
  }

  const safePortal = input.portal.replace(/[^a-z0-9_-]/gi, "");
  const safeScope = input.scope.replace(/[^A-Za-z0-9_-]/g, "");
  const key = `raw-html/${safePortal}/${safeScope}/${input.runId}.html.gz`;

  const gzipped = gzip(input.html);
  await r2Put({
    creds: {
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET,
    },
    key,
    body: gzipped,
    contentType: "text/html; charset=utf-8",
    extraHeaders: {
      "content-encoding": "gzip",
    },
  });

  return { key, gzipBytes: gzipped.byteLength };
}

function gzip(text: string): Uint8Array {
  return new Uint8Array(gzipSync(Buffer.from(text, "utf8")));
}
