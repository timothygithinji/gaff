/**
 * Parse a pasted listing URL into the portal + listing ID we key on, so
 * a user can add a property to their pipeline by URL (see
 * `addListingByUrl`). Recognises the three portals' detail-page URLs:
 *
 *   - Rightmove: https://www.rightmove.co.uk/properties/{id}
 *   - Zoopla:    https://www.zoopla.co.uk/to-rent/details/{id}/
 *   - OpenRent:  https://www.openrent.co.uk/{id}
 *                https://www.openrent.co.uk/property-to-rent/{slug}/{id}
 *
 * Returns `null` for anything unrecognised (wrong host, a search-results
 * URL, a non-listing page) so the caller can surface a clear error rather
 * than scrape garbage. The `canonicalUrl` is the clean detail URL we
 * store + fetch, independent of tracking params the user pasted.
 */
import type { Portal } from "./parsers/types";

export type ParsedListingUrl = {
  portal: Portal;
  portalListingId: string;
  canonicalUrl: string;
};

const RIGHTMOVE_PATH_RE = /^\/properties\/(\d+)/;
const ZOOPLA_PATH_RE = /^\/to-rent\/details\/(\d+)/;
const OPENRENT_SLUG_PATH_RE = /^\/property-to-rent\/.+\/(\d+)\/?$/;
const OPENRENT_BARE_PATH_RE = /^\/(\d+)\/?$/;

/** Does `host` end with `domain` (so sub-domains like www. match)? */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function parseListingUrl(input: string): ParsedListingUrl | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (hostMatches(host, "rightmove.co.uk")) {
    const m = RIGHTMOVE_PATH_RE.exec(path);
    if (!m?.[1]) {
      return null;
    }
    return {
      portal: "rightmove",
      portalListingId: m[1],
      canonicalUrl: `https://www.rightmove.co.uk/properties/${m[1]}`,
    };
  }

  if (hostMatches(host, "zoopla.co.uk")) {
    const m = ZOOPLA_PATH_RE.exec(path);
    if (!m?.[1]) {
      return null;
    }
    return {
      portal: "zoopla",
      portalListingId: m[1],
      canonicalUrl: `https://www.zoopla.co.uk/to-rent/details/${m[1]}/`,
    };
  }

  if (hostMatches(host, "openrent.co.uk")) {
    const m = OPENRENT_SLUG_PATH_RE.exec(path) ?? OPENRENT_BARE_PATH_RE.exec(path);
    if (!m?.[1]) {
      return null;
    }
    return {
      portal: "openrent",
      portalListingId: m[1],
      canonicalUrl: `https://www.openrent.co.uk/${m[1]}`,
    };
  }

  return null;
}
