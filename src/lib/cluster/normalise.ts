/**
 * Address normalisation for cluster matching.
 *
 * Cross-portal dedupe relies on producing the SAME normalised string for
 * two listings that describe the same physical home, and DIFFERENT
 * strings for two listings that describe different homes — including
 * different flats in the same building. The handoff calls this out
 * specifically as quirk #8: Flat 1 / Flat 2 / Flat 3 at the same
 * address must NOT collapse into one cluster.
 *
 * The rules in plain English:
 *
 *   1. Lowercase everything (case is never semantic in UK addresses).
 *   2. Strip all punctuation — commas, semicolons, periods, apostrophes,
 *      slashes — they're typesetting choices, not meaning.
 *   3. Collapse any run of whitespace to a single space.
 *   4. KEEP every digit and every letter, including:
 *        - flat numbers ("Flat 1" / "Flat 2" stay distinct)
 *        - apartment / unit / suite prefixes
 *        - house number suffixes ("22A" stays distinct from "22")
 *        - the postcode itself (with its internal space preserved)
 *   5. Don't try to reorder tokens — Rightmove and Zoopla emit the same
 *      tokens in the same order for the same property; the SAME normalised
 *      string falls out without any AST work.
 *
 * The function is intentionally REGEX-AND-SPLIT, not a parser: parsing
 * UK addresses correctly is famously hard (Royal Mail's PAF spec runs to
 * dozens of pages), and we deliberately don't need to. Equality is the
 * only operation that matters here — two raw strings either normalise
 * the same or they don't.
 */

// Anything that isn't a letter, digit, or whitespace is treated as
// pure punctuation. Splitting on commas would lose the "Flat 1" / "Flat 2"
// distinction inside `Flat 1, 22 Elm Street` because each comma-joined
// chunk shares the building part — we want to keep all tokens in order.
const PUNCTUATION_RE = /[^a-z0-9\s]/g;
const WHITESPACE_RE = /\s+/g;

/**
 * Normalise a raw portal-supplied address into a stable string key for
 * cluster lookup.
 *
 *   - "Flat 4, 12 Elm Street, NW3 1AA"
 *     → "flat 4 12 elm street nw3 1aa"
 *   - "Flat 2, 22 Elm Street, NW3 1AA"
 *     → "flat 2 22 elm street nw3 1aa"
 *     // Asserts: distinct from "flat 1 22 elm street nw3 1aa".
 *   - "22 Elm Street, NW3 1AA"
 *     → "22 elm street nw3 1aa"
 *     // Asserts: distinct from any flat-prefixed version of the same building.
 *   - "22A Elm Street, NW3 1AA"
 *     → "22a elm street nw3 1aa"
 *     // Asserts: the trailing letter on a house number counts as a unit; "22" and "22a" stay distinct.
 *   - "Apartment 5, The Old Mill, NW3 1AB"
 *     → "apartment 5 the old mill nw3 1ab"
 *     // Asserts: "Apartment", "Unit", "Suite" etc. survive — they're tokens like any other.
 *   - "  flat 4 ,  12 ELM  Street ,  NW3 1AA "
 *     → "flat 4 12 elm street nw3 1aa"
 *     // Asserts: leading/trailing/inner whitespace + casing all normalise away.
 */
export function normaliseAddress(raw: string): string {
  return (
    raw
      .toLowerCase()
      // Strip commas/periods/etc. but keep the characters between them.
      // We replace with a space rather than deleting outright so that
      // tokens that were comma-separated without a space ("flat 4,12 elm")
      // don't fuse into one.
      .replace(PUNCTUATION_RE, " ")
      // Collapse the spray of spaces produced by the punctuation strip.
      .replace(WHITESPACE_RE, " ")
      .trim()
  );
}
