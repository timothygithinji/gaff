/**
 * Minimal parser for Next.js App Router RSC flight chunks.
 *
 * Pages embed multiple <script>self.__next_f.push([1, "<id>:<json>\n<id>:<json>..."])</script>
 * entries. Each push contains one or more `<hexId>:<json>` rows. JSON values
 * can be primitives, arrays, or objects. We collect them all into a map
 * keyed by hexId, and provide helpers to find values by deep key.
 */

export type FlightMap = Map<string, unknown>;

function unescapeStringLiteral(s: string): string {
  // Reverse what JSON.stringify did to the inner string when emitted as a JS literal.
  // We use JSON.parse to handle every escape correctly.
  return JSON.parse(`"${s}"`);
}

export function parseFlight(html: string): FlightMap {
  const map: FlightMap = new Map();
  // Match `self.__next_f.push([N, "..."])` for N=1 (data rows).
  // We have to consume escaped quotes inside the second string literal.
  const re = /self\.__next_f\.push\(\[\s*1\s*,\s*"((?:\\.|[^"\\])*)"\s*\]\)/g;
  for (const match of html.matchAll(re)) {
    let payload: string;
    try {
      payload = unescapeStringLiteral(match[1]);
    } catch {
      continue;
    }
    // Each payload is one-or-more `<hex>:<json>\n<hex>:<json>...` lines.
    // But values can span lines and contain colons, so we parse forward.
    let i = 0;
    while (i < payload.length) {
      // Skip whitespace
      while (
        i < payload.length &&
        (payload[i] === "\n" || payload[i] === "\r" || payload[i] === " ")
      ) {
        i++;
      }
      if (i >= payload.length) {
        break;
      }
      // Read id (hex up to ':')
      const idStart = i;
      while (i < payload.length && payload[i] !== ":") {
        i++;
      }
      if (i >= payload.length) {
        break;
      }
      const id = payload.slice(idStart, i);
      i++; // skip ':'
      // The value is JSON; find its end by tracking balance
      const valStart = i;
      const valEnd = findJsonEnd(payload, i);
      if (valEnd === -1) {
        break;
      }
      const valSrc = payload.slice(valStart, valEnd);
      i = valEnd;
      try {
        map.set(id, JSON.parse(valSrc));
      } catch {
        // Silently skip malformed rows; we still capture the rest
      }
      // Move past trailing newline if any
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
    // true | false | null
    let lit = "null";
    if (c === "t") {
      lit = "true";
    } else if (c === "f") {
      lit = "false";
    }
    return s.startsWith(lit, i) ? i + lit.length : -1;
  }
  // number — read up to whitespace, comma, or closing bracket
  let j = i;
  if (s[j] === "-") {
    j++;
  }
  while (j < s.length && /[0-9.eE+-]/.test(s[j])) {
    j++;
  }
  return j > i ? j : -1;
}

function findStringEnd(s: string, start: number): number {
  // start points at opening "
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
 * Walk the entire flight map looking for the first value where `predicate` returns true.
 * Returns the matching value or null.
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
 * Convenience: find the first object that has the given key, return obj[key].
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
