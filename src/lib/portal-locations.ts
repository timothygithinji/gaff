/**
 * Per-portal location resolvers.
 *
 * Each resolver takes a Google-derived {@link SearchLocation} and
 * returns the portal-specific token shape we'll later stamp onto the
 * row's `portalRefs`. Resolution happens at save time in
 * `src/server/functions/searches.ts`; scrape-portal reads the cached
 * refs directly and never re-resolves.
 *
 * Behaviour was probed empirically against each portal before this
 * file was written:
 *
 *   - Rightmove: `los.rightmove.co.uk/typeahead` returns matches of
 *     types OUTCODE, REGION, STREET, STATION. We use OUTCODE for
 *     postcode-typed places, REGION for everything else. The typeahead
 *     400s on `!`, `'`, `.` and chokes on commas, so we sanitise the
 *     query before sending. When multiple REGION matches share the
 *     name (e.g. "Camden Town, North West London" vs "Camden Town,
 *     Gosport, Hampshire"), we rank by token-overlap with the Google
 *     place's `formattedAddress` so the London one wins.
 *
 *   - Zoopla: their `/search/?section=to-rent&q=...` route accepts
 *     arbitrary free text and resolves the place server-side. Passing
 *     the full `formattedAddress` ("Camden Town, London NW1, UK") gave
 *     correct, scoped results in every probe case. Bbox / lat-lng
 *     params on the property route are silently ignored.
 *
 *   - OpenRent: their search URL takes `term=` (free text) and
 *     `within=` (radius in miles). We pass the place name as the term
 *     and derive `within` from the viewport bounds — diagonal in miles
 *     from the centroid to a corner — clamped to [1, 5] so a chosen
 *     city doesn't accidentally scrape its whole metro.
 */

import type {
  OpenrentLocationRef,
  RightmoveLocationRef,
  SearchLocation,
  ZooplaLocationRef,
} from "./search-location";

/**
 * Per-portal failure when the resolver can't produce a usable ref.
 * Carries `portal` so the form can render an inline error scoped to
 * the right portal toggle.
 */
export class PortalResolveError extends Error {
  constructor(
    public readonly portal: "rightmove" | "zoopla" | "openrent",
    message: string
  ) {
    super(message);
    this.name = "PortalResolveError";
  }
}

// -----------------------------------------------------------------------------
// Rightmove
// -----------------------------------------------------------------------------

const RM_TYPEAHEAD = "https://los.rightmove.co.uk/typeahead";
const RM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type RightmoveMatch = { id: string; type: string; displayName: string };
type RightmoveResponse = { matches: RightmoveMatch[] };

/**
 * Strip characters Rightmove's typeahead rejects (`!`, `.`, commas,
 * etc.) and collapse the resulting whitespace. Apostrophes are ELIDED
 * (deleted, not converted to a space) so `John's` becomes `Johns` —
 * Rightmove indexes the contracted form, and `John s` as two tokens
 * misses the match. Other word-breaking punctuation (`.`, `,`, `!`,
 * `;`, `:`, `?`, `"`) becomes a space so `St. John's Wood` works.
 * The unsanitised input is otherwise echoed in the URL and would
 * return HTTP 400.
 */
function sanitiseRightmoveQuery(name: string): string {
  return name
    .replace(/['’]+/g, "") // straight + curly apostrophes elided
    .replace(/["!.,;:?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRightmoveTypeahead(
  query: string
): Promise<RightmoveMatch[]> {
  const url = `${RM_TYPEAHEAD}?query=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": RM_UA },
  });
  if (!res.ok) {
    throw new PortalResolveError(
      "rightmove",
      `typeahead HTTP ${res.status} for "${query}"`
    );
  }
  const data = (await res.json()) as RightmoveResponse;
  return data.matches ?? [];
}

/**
 * Tokenise into lowercase alpha-numeric runs of length > 2. Short
 * tokens like "uk", "n", "of" carry no disambiguation signal and just
 * inflate scores uniformly.
 */
function tokeniseForScoring(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  return new Set(tokens);
}

function scoreMatch(displayName: string, fmtTokens: Set<string>): number {
  const dispTokens = tokeniseForScoring(displayName);
  let score = 0;
  for (const t of dispTokens) {
    if (fmtTokens.has(t)) score += 1;
  }
  return score;
}

export async function resolveRightmove(
  loc: SearchLocation
): Promise<RightmoveLocationRef> {
  const query = sanitiseRightmoveQuery(loc.name);
  if (!query) {
    throw new PortalResolveError(
      "rightmove",
      "name is empty after sanitisation"
    );
  }

  const matches = await fetchRightmoveTypeahead(query);

  if (loc.type === "postal_code") {
    const o = matches.find(
      (m) =>
        m.type === "OUTCODE" &&
        m.displayName.toUpperCase() === query.toUpperCase()
    );
    if (!o) {
      throw new PortalResolveError(
        "rightmove",
        `Rightmove has no OUTCODE for "${query}"`
      );
    }
    return { locationIdentifier: `OUTCODE^${o.id}` };
  }

  // For non-postcode places we want REGION matches. STREET / STATION
  // results from the typeahead are useful as user breadcrumbs but
  // aren't valid search scopes.
  const regions = matches.filter((m) => m.type === "REGION");
  if (regions.length === 0) {
    throw new PortalResolveError(
      "rightmove",
      `Rightmove doesn't index "${query}" as a searchable region`
    );
  }

  // Rank by token overlap with the Google `formattedAddress` — this is
  // what disambiguates "Camden Town, North West London" (good) from
  // "Camden Town, Gosport, Hampshire" (also exists). Ties resolve to
  // Rightmove's own ordering (first wins), which empirically prefers
  // the narrower neighbourhood over the wider borough — desirable.
  const fmtTokens = tokeniseForScoring(loc.formattedAddress);
  // The `regions.length === 0` guard above means [0] is defined, but
  // TS with `noUncheckedIndexedAccess` still types it as possibly
  // undefined — assert with `!` once and walk the tail.
  let best = regions[0]!;
  let bestScore = scoreMatch(best.displayName, fmtTokens);
  for (let i = 1; i < regions.length; i += 1) {
    const m = regions[i]!;
    const s = scoreMatch(m.displayName, fmtTokens);
    if (s > bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return { locationIdentifier: `REGION^${best.id}` };
}

// -----------------------------------------------------------------------------
// Zoopla
// -----------------------------------------------------------------------------

/**
 * Zoopla's `/search/?section=to-rent&q=...` route resolves the place
 * server-side. The probe showed `formattedAddress` consistently scopes
 * results correctly (Camden Town → NW1+NW5, NW3 → NW3, Manchester →
 * Manchester outcodes). No typeahead call needed.
 */
export function resolveZoopla(loc: SearchLocation): ZooplaLocationRef {
  return { q: loc.formattedAddress };
}

// -----------------------------------------------------------------------------
// OpenRent
// -----------------------------------------------------------------------------

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMiles(a: { lat: number; lng: number }, b: {
  lat: number;
  lng: number;
}): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Diagonal radius (centroid → NE corner) clamped to [1, 5] miles.
 * Anything over 5 starts pulling in too much surrounding noise for a
 * within-N search; under 1 underfills for narrow places like single
 * outcodes. When bounds are absent (degenerate backfill) we fall back
 * to the OpenRent default radius of 1mi to match historic behaviour.
 */
function withinMilesFromBounds(loc: SearchLocation): number {
  if (!loc.bounds) return 1;
  const centroid = { lat: loc.lat, lng: loc.lng };
  const diag = haversineMiles(centroid, loc.bounds.ne);
  return Math.max(1, Math.min(5, Math.round(diag)));
}

export function resolveOpenrent(loc: SearchLocation): OpenrentLocationRef {
  return {
    term: loc.name,
    withinMiles: withinMilesFromBounds(loc),
  };
}
