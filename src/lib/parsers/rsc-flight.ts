/**
 * Minimal parser for Next.js App Router RSC flight chunks (used by Zoopla).
 *
 * Pages embed multiple
 *   <script>self.__next_f.push([1, "<id>:<json>\n<id>:<json>..."])</script>
 * entries. Each push contains one or more `<hexId>:<json>` rows. JSON
 * values can be primitives, arrays, or objects. We collect them all into
 * a map keyed by hexId, and provide helpers to find values by deep key.
 *
 * Promoted from `scripts/verify/lib/rsc-flight.ts`.
 */

export type FlightMap = Map<string, unknown>;

const NEXT_F_PUSH_RE =
  /self\.__next_f\.push\(\[\s*1\s*,\s*"((?:\\.|[^"\\])*)"\s*\]\)/g;
const NUMBER_CHAR_RE = /[0-9.eE+-]/;

function unescapeStringLiteral(s: string): string {
  // Reverse what JSON.stringify did to the inner string when emitted as a
  // JS literal. We use JSON.parse to handle every escape correctly.
  return JSON.parse(`"${s}"`);
}

// React's RSC flight format encodes some rows with a leading tag char and
// a hex byte-length:
//
//   <id>:T<hexLen>,<utf8 text>
//
// `T` is the tag we care about — Zoopla's `detailedDescription` is often
// stored as `$<refId>` pointing at a `T`-tagged chunk that holds the
// actual prose. Other tag chars (`I`/`L`/`M`/...) carry module/import
// metadata we don't read, but we still need to consume them cleanly so
// the next row is found.
const ROW_TAG_RE = /^[A-Z]$/;
const HEX_DIGIT_RE = /[0-9a-f]/i;

// Pull `<hexLen>,` off the front of a tagged row; return the byte length
// and the index immediately after the comma, or null if the row is
// malformed.
function readTaggedHeader(
  payload: string,
  start: number
): { byteLen: number; textStart: number } | null {
  let j = start;
  while (j < payload.length && payload[j] !== ",") {
    j++;
  }
  if (j >= payload.length) {
    return null;
  }
  const byteLen = Number.parseInt(payload.slice(start, j), 16);
  if (!Number.isFinite(byteLen)) {
    return null;
  }
  return { byteLen, textStart: j + 1 };
}

// Walk `payload` from `start` consuming exactly `byteLen` UTF-8 bytes.
// Returns the index immediately past the last consumed codepoint.
function utf8WalkEnd(payload: string, start: number, byteLen: number): number {
  let consumed = 0;
  let i = start;
  while (i < payload.length && consumed < byteLen) {
    const cp = payload.codePointAt(i) ?? 0;
    if (cp <= 0x7f) {
      consumed += 1;
    } else if (cp <= 0x7ff) {
      consumed += 2;
    } else if (cp <= 0xffff) {
      consumed += 3;
    } else {
      consumed += 4;
    }
    i += cp > 0xffff ? 2 : 1;
  }
  return i;
}

// Skip to the start of the next chunk row (after the next newline), so a
// single malformed row doesn't abandon every later row in the payload.
function skipToNextRow(payload: string, start: number): number {
  let i = start;
  while (i < payload.length && payload[i] !== "\n" && payload[i] !== "\r") {
    i++;
  }
  while (i < payload.length && (payload[i] === "\n" || payload[i] === "\r")) {
    i++;
  }
  return i;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-row dispatch over JSON / tagged-text / skip cases.
export function parseFlight(html: string): FlightMap {
  const map: FlightMap = new Map();
  // Match `self.__next_f.push([N, "..."])` for N=1 (data rows).
  // We have to consume escaped quotes inside the second string literal.
  for (const match of html.matchAll(NEXT_F_PUSH_RE)) {
    let payload: string;
    try {
      payload = unescapeStringLiteral(match[1] ?? "");
    } catch {
      continue;
    }
    // Each payload is one-or-more `<hex>:<value>\n<hex>:<value>...` lines.
    // Values can span lines and contain colons, so we parse forward.
    let i = 0;
    while (i < payload.length) {
      while (
        i < payload.length &&
        (payload[i] === "\n" || payload[i] === "\r" || payload[i] === " ")
      ) {
        i++;
      }
      if (i >= payload.length) {
        break;
      }
      const idStart = i;
      while (i < payload.length && payload[i] !== ":") {
        i++;
      }
      if (i >= payload.length) {
        break;
      }
      const id = payload.slice(idStart, i);
      i++; // skip ':'

      // Tagged-text row: `T<hexLen>,<utf8 text>`. Store the text as a
      // plain string so reference lookups (`$<id>`) resolve cleanly.
      if (payload[i] === "T") {
        const header = readTaggedHeader(payload, i + 1);
        if (!header) {
          i = skipToNextRow(payload, i);
          continue;
        }
        const end = utf8WalkEnd(payload, header.textStart, header.byteLen);
        map.set(id, payload.slice(header.textStart, end));
        i = end;
      } else if (
        payload[i] !== undefined &&
        ROW_TAG_RE.test(payload[i] as string) &&
        payload[i + 1] !== undefined &&
        HEX_DIGIT_RE.test(payload[i + 1] as string)
      ) {
        // Other tag (I/L/M/...): consume to the end of line. We don't
        // store these — they're module/import metadata, not page data —
        // but we must advance past them so later rows still parse.
        i = skipToNextRow(payload, i);
        continue;
      } else {
        // Plain JSON value row.
        const valStart = i;
        const valEnd = findJsonEnd(payload, i);
        if (valEnd === -1) {
          // Malformed: skip just this row, keep parsing the rest of the
          // payload. The pre-fix behaviour was to `break` and lose every
          // subsequent row.
          i = skipToNextRow(payload, i);
          continue;
        }
        const valSrc = payload.slice(valStart, valEnd);
        i = valEnd;
        try {
          map.set(id, JSON.parse(valSrc));
        } catch {
          // Silently skip malformed JSON; the row is consumed so we
          // continue with the next one.
        }
      }
      while (
        i < payload.length &&
        (payload[i] === "\n" || payload[i] === "\r")
      ) {
        i++;
      }
    }
  }
  return map;
}

/** Find end index (exclusive) of a JSON value starting at `start` in s. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSON-value boundary scan — branches are intentional.
function findJsonEnd(s: string, start: number): number {
  let i = start;
  while (i < s.length && (s[i] === " " || s[i] === "\t")) {
    i++;
  }
  if (i >= s.length) {
    return -1;
  }
  const c = s[i];
  if (c === '"') {
    return findStringEnd(s, i);
  }
  if (c === "{" || c === "[") {
    return findContainerEnd(s, i);
  }
  if (c === "t" || c === "f" || c === "n") {
    let lit: string;
    if (c === "t") {
      lit = "true";
    } else if (c === "f") {
      lit = "false";
    } else {
      lit = "null";
    }
    return s.startsWith(lit, i) ? i + lit.length : -1;
  }
  // number — read up to whitespace, comma, or closing bracket
  let j = i;
  if (s[j] === "-") {
    j++;
  }
  while (j < s.length && NUMBER_CHAR_RE.test(s[j] as string)) {
    j++;
  }
  return j > i ? j : -1;
}

function findStringEnd(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length) {
    if (s[i] === "\\") {
      i += 2;
    } else if (s[i] === '"') {
      return i + 1;
    } else {
      i++;
    }
  }
  return -1;
}

function findContainerEnd(s: string, start: number): number {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') {
      i = findStringEnd(s, i);
      if (i === -1) {
        return -1;
      }
      continue;
    }
    if (c === open) {
      depth++;
    } else if (c === close) {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Walk the entire flight map looking for the first value where
 * `predicate` returns true. Returns the matching value, or `null`.
 */
export function findInFlight(
  flight: FlightMap,
  predicate: (value: unknown) => boolean
): unknown {
  for (const value of flight.values()) {
    const hit = deepFind(value, predicate);
    if (hit !== undefined) {
      return hit;
    }
  }
  return null;
}

function deepFind(node: unknown, predicate: (v: unknown) => boolean): unknown {
  if (node === null || node === undefined) {
    return undefined;
  }
  if (predicate(node)) {
    return node;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = deepFind(child, predicate);
      if (hit !== undefined) {
        return hit;
      }
    }
  } else if (typeof node === "object") {
    for (const key of Object.keys(node as object)) {
      const hit = deepFind((node as Record<string, unknown>)[key], predicate);
      if (hit !== undefined) {
        return hit;
      }
    }
  }
  return undefined;
}

/**
 * Convenience: find the first object that has the given key, then return
 * the object itself (caller can read the key directly).
 */
export function findByKey(flight: FlightMap, key: string): unknown {
  return findInFlight(
    flight,
    (v) =>
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      key in (v as object)
  );
}

// RSC reference: a bare `$<hex>` string that points at another chunk in
// the same flight map. Used for any value too large or shared enough to
// warrant deduplication — Zoopla's `detailedDescription` is the canonical
// example.
const FLIGHT_REF_RE = /^\$([A-Za-z0-9]+)$/;
const MAX_REF_DEPTH = 5;

/**
 * Follow `$<id>` references through the flight map. Plain (non-reference)
 * values are returned as-is. Stops after `MAX_REF_DEPTH` hops to avoid
 * runaway cycles in malformed payloads.
 */
export function resolveFlightRef(flight: FlightMap, value: unknown): unknown {
  let cur = value;
  for (let depth = 0; depth < MAX_REF_DEPTH; depth++) {
    if (typeof cur !== "string") {
      return cur;
    }
    const m = FLIGHT_REF_RE.exec(cur);
    if (!m) {
      return cur;
    }
    const next = flight.get(m[1] as string);
    if (next === undefined) {
      return undefined;
    }
    cur = next;
  }
  return cur;
}
