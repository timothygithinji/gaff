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
 *   - OpenRent: their search URL takes `term=` (free text). We pass
 *     the place name as the term. The radius (`area=<km int>` in OR's
 *     URL) is user-driven and lives on `searches.radiusMiles`; it gets
 *     converted from miles → km and floored at 2km at URL-build time —
 *     see `openrentSearchUrl` in `src/lib/portal-urls.ts`.
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
  readonly portal: "rightmove" | "zoopla" | "openrent";

  constructor(portal: "rightmove" | "zoopla" | "openrent", message: string) {
    super(message);
    this.portal = portal;
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
const SCORING_TOKEN_SPLIT_RE = /[^a-z0-9]+/;

function tokeniseForScoring(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .split(SCORING_TOKEN_SPLIT_RE)
    .filter((t) => t.length > 2);
  return new Set(tokens);
}

function scoreMatch(displayName: string, fmtTokens: Set<string>): number {
  const dispTokens = tokeniseForScoring(displayName);
  let score = 0;
  for (const t of dispTokens) {
    if (fmtTokens.has(t)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Per-outcode Rightmove resolution for area searches. Uses the same
 * typeahead the postal_code path uses, but takes a bare outcode string
 * (e.g. "NW3") and returns `null` instead of throwing when Rightmove
 * doesn't index it. The area path runs N of these in parallel and
 * silently drops the misses, since one missing outcode shouldn't
 * sink the whole search.
 */
export async function resolveRightmoveOutcode(
  outcode: string
): Promise<RightmoveLocationRef | null> {
  const query = sanitiseRightmoveQuery(outcode);
  if (!query) {
    return null;
  }
  try {
    const matches = await fetchRightmoveTypeahead(query);
    const o = matches.find(
      (m) =>
        m.type === "OUTCODE" &&
        m.displayName.toUpperCase() === query.toUpperCase()
    );
    return o ? { locationIdentifier: `OUTCODE^${o.id}` } : null;
  } catch {
    // Network blips during a multi-outcode resolve shouldn't abort the
    // whole save — return null so the caller skips this outcode on
    // Rightmove (Zoopla / OpenRent still pick it up via free-text).
    return null;
  }
}

/** Per-outcode Zoopla ref. Zoopla resolves bare outcodes server-side. */
export function resolveZooplaOutcode(outcode: string): ZooplaLocationRef {
  return { q: outcode };
}

/** Per-outcode OpenRent ref. OpenRent resolves bare outcodes server-side. */
export function resolveOpenrentOutcode(outcode: string): OpenrentLocationRef {
  return { term: outcode };
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
  // `regions` is non-empty (guarded above), but noUncheckedIndexedAccess
  // still types indexed access as possibly-undefined. Destructure the
  // head + walk the tail with for-of so every access is provably defined
  // without a non-null assertion.
  const [firstRegion, ...restRegions] = regions;
  if (!firstRegion) {
    throw new Error("no candidate regions to rank");
  }
  let best = firstRegion;
  let bestScore = scoreMatch(best.displayName, fmtTokens);
  for (const m of restRegions) {
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

/**
 * OpenRent's resolver only needs the place name as the `term` — the
 * search radius is user-driven (`searches.radiusMiles`) and applied at
 * URL-build time in `openrentSearchUrl`, not derived from the place's
 * viewport.
 */
export function resolveOpenrent(loc: SearchLocation): OpenrentLocationRef {
  return { term: loc.name };
}
