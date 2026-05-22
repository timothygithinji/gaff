/**
 * Rightmove location identifier resolver.
 *
 * Rightmove's search URL needs `locationIdentifier=OUTCODE^<numericId>`
 * where the numeric id is Rightmove's internal mapping for the outcode
 * (e.g. NW3 → 1859, N11 → 1668). The plain outcode string does NOT
 * work — Rightmove silently returns a "we couldn't find that place"
 * page with no listings.
 *
 * The typeahead endpoint at `los.rightmove.co.uk/typeahead` is the
 * supported way to resolve outcodes to identifiers (it's what
 * Rightmove's own search bar calls). It's public, unauthenticated,
 * and stable enough to use directly.
 */

const TYPEAHEAD_ENDPOINT = "https://los.rightmove.co.uk/typeahead";

type TypeaheadMatch = {
  id: string;
  type: string;
  displayName: string;
};

type TypeaheadResponse = {
  matches: TypeaheadMatch[];
};

/**
 * Resolve a UK outcode (e.g. "N11", "NW3") to a Rightmove
 * `locationIdentifier` of the form `OUTCODE^<numericId>`. Throws if no
 * OUTCODE match exists for the input.
 */
export async function resolveRightmoveLocationIdentifier(
  outcode: string
): Promise<string> {
  const query = outcode.trim().toUpperCase();
  if (!query) {
    throw new Error("resolveRightmoveLocationIdentifier: empty outcode");
  }
  const url = `${TYPEAHEAD_ENDPOINT}?query=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      // Rightmove's typeahead rejects requests without a browser-like UA.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Rightmove typeahead ${res.status} ${res.statusText} for "${query}"`
    );
  }
  const data = (await res.json()) as TypeaheadResponse;
  const outcodeMatch = data.matches.find(
    (m) => m.type === "OUTCODE" && m.displayName.toUpperCase() === query
  );
  if (!outcodeMatch) {
    throw new Error(
      `Rightmove typeahead: no OUTCODE match for "${query}" (got: ${data.matches
        .slice(0, 3)
        .map((m) => `${m.type}:${m.displayName}`)
        .join(", ")})`
    );
  }
  return `OUTCODE^${outcodeMatch.id}`;
}

/**
 * Per-call cache wrapper. A scrape-portal task run hits the same
 * outcode multiple times only if the search is misconfigured, but
 * caching is cheap and keeps the network call count to exactly one
 * per unique outcode per run.
 */
export function createRightmoveLocationCache(): (
  outcode: string
) => Promise<string> {
  const cache = new Map<string, Promise<string>>();
  return (outcode: string) => {
    const key = outcode.trim().toUpperCase();
    const existing = cache.get(key);
    if (existing) {
      return existing;
    }
    const promise = resolveRightmoveLocationIdentifier(key);
    cache.set(key, promise);
    return promise;
  };
}
