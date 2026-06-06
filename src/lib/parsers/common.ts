/**
 * Low-level helpers shared by all portal parsers. Promoted from
 * `scripts/verify/lib/extract.ts` — kept deliberately small.
 */

/**
 * Extract a JSON island by `id` attribute (e.g. `__NEXT_DATA__`).
 * Throws when the script tag is missing.
 */
export function extractScriptJson(html: string, scriptId: string): unknown {
  const re = new RegExp(
    `<script[^>]+id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i"
  );
  const match = html.match(re);
  if (!match) {
    throw new Error(`<script id="${scriptId}"> not found in HTML`);
  }
  return JSON.parse(match[1] ?? "");
}

/**
 * Navigate a nested JSON value by a list of keys, returning `unknown`.
 * Throws with the path that failed when a step is missing.
 */
export function pluck(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (let i = 0; i < path.length; i++) {
    const key = path[i] as string | number;
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string | number, unknown>)[key];
      if (cur === undefined) {
        throw new Error(
          `Path break at .${path
            .slice(0, i + 1)
            .join(".")} (key '${String(key)}' undefined)`
        );
      }
    } else {
      throw new Error(
        `Path break at .${path.slice(0, i + 1).join(".")} (parent not object)`
      );
    }
  }
  return cur;
}

/**
 * Try `pluck` on several candidate paths; return the first that resolves.
 */
export function probe(
  obj: unknown,
  paths: (string | number)[][]
): { path: (string | number)[]; value: unknown } | null {
  for (const path of paths) {
    try {
      const value = pluck(obj, path);
      if (value !== undefined) {
        return { path, value };
      }
    } catch {
      // try the next path
    }
  }
  return null;
}

/** Coerce an unknown to `number | undefined` (parses numeric strings). */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseFloat(v.replace(/[,£\s]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Bathroom count, normalised. Portals (Zoopla `numBathrooms`, Rightmove
 * `bathrooms`, OpenRent card text) emit `0` as their missing-value
 * sentinel for listings that don't state a bathroom count — but no
 * rentable property has zero bathrooms. We treat a non-positive count as
 * unknown (`undefined`) so it round-trips as NULL and is kept (not
 * dropped) by the band filters, rather than displaying "0 baths" or
 * being wrongly excluded by a `bathrooms >= 1` filter. A genuine count
 * (1+) passes through unchanged. Bedrooms are deliberately NOT routed
 * through this — `0` bedrooms is a valid studio.
 */
export function bathroomCount(v: unknown): number | undefined {
  const n = toNumber(v);
  return typeof n === "number" && n > 0 ? n : undefined;
}

/** Coerce an unknown to `string | undefined` (trims, rejects empty). */
export function coerceString(v: unknown): string | undefined {
  if (typeof v === "string") {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return undefined;
}

/** UK postcode regex — anchored, expects standard format. */
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?\b/i;

/**
 * Extract a UK postcode from free-form text. Returns the matched
 * postcode (upper-cased) or `undefined`.
 */
export function extractPostcode(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }
  const m = text.match(POSTCODE_RE);
  if (!m) {
    return undefined;
  }
  const outcode = (m[1] ?? "").toUpperCase();
  const incode = (m[2] ?? "").toUpperCase();
  return incode ? `${outcode} ${incode}` : outcode;
}

/**
 * Decode a small set of common HTML entities. Sufficient for `<title>`
 * and meta tag text — not a general-purpose HTML decoder.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£");
}
