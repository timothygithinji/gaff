/**
 * BT Wholesale broadband-availability client (via Zyte).
 *
 * **Status: stubbed.** The `broadbandchecker.btwholesale.com` SPA
 * doesn't expose a stable JSON endpoint we can hit directly — every
 * documented path 404s and the real frontend orchestrates a multi-
 * step session against an internal RPC. Proper coverage will require
 * a real headless-browser scrape (`zyteFetch({ browserHtml: true })`)
 * plus address-step automation, which is its own piece of work.
 *
 * For now `getBroadband` always returns a null-filled result so the
 * `enrichments.broadband` slot exists and downstream callers don't
 * have to special-case "no broadband data yet". The AI's verbatim
 * extraction from the listing description (`features.broadband`)
 * remains the only real broadband signal in the system.
 */

export type BroadbandResult = {
  technology: "FTTP" | "FTTC" | "ADSL" | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  fttpAvailable: boolean;
};

export type GetBroadbandInput = {
  zyteApiKey: string;
  postcode: string;
};

/**
 * Stub. Always resolves to a null-filled `BroadbandResult` until the
 * real BT Wholesale (or alternative) scrape is implemented. See the
 * file header for why.
 *
 * Keep the signature stable so the Trigger task and any UI consumers
 * don't churn when we wire a real source back in.
 */
// biome-ignore lint/suspicious/useAwait: signature must stay async to match the eventual real implementation.
export async function getBroadband(
  _input: GetBroadbandInput
): Promise<BroadbandResult> {
  return {
    technology: null,
    downloadMbps: null,
    uploadMbps: null,
    fttpAvailable: false,
  };
}
