/**
 * Public client config — values that need to reach the browser.
 *
 * Today: just the Google Maps JS API key for Places Autocomplete in
 * the search form. The same key is already exposed via the listing
 * detail iframe URL (`getListingDetail`), so this isn't a new
 * exposure surface — domain restriction in GCP is the real boundary.
 *
 * Keep this server function lean. If it grows to carry multiple
 * public values, return a `PublicConfig` object instead of a raw
 * string so the call sites can destructure cleanly.
 */
import { createServerFn } from "@tanstack/react-start";
import { env } from "../../lib/env";

export const getMapsKey = createServerFn({ method: "GET" }).handler(
  (): string => env().GOOGLE_MAPS_API_KEY
);
