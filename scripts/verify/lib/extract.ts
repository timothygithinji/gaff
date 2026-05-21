/**
 * Extract a JSON island by id attribute. Used for `__NEXT_DATA__` on Rightmove/Zoopla.
 */
export function extractScriptJson(html: string, scriptId: string): unknown {
  const re = new RegExp(
    `<script[^>]+id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const match = html.match(re);
  if (!match) throw new Error(`<script id="${scriptId}"> not found in HTML`);
  return JSON.parse(match[1]);
}

/**
 * Navigate a nested JSON value by a list of keys, returning unknown.
 * Throws with the path that failed when a step is missing.
 */
export function pluck(obj: unknown, path: (string | number)[]): unknown {
  let cur: unknown = obj;
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (cur && typeof cur === "object") {
      // @ts-expect-error dynamic
      cur = cur[key];
      if (cur === undefined) {
        throw new Error(`Path break at .${path.slice(0, i + 1).join(".")} (key '${String(key)}' undefined)`);
      }
    } else {
      throw new Error(`Path break at .${path.slice(0, i + 1).join(".")} (parent not object)`);
    }
  }
  return cur;
}

/** Probe many possible paths, return the first one that resolves. */
export function probe(obj: unknown, paths: (string | number)[][]): { path: (string | number)[]; value: unknown } | null {
  for (const path of paths) {
    try {
      const value = pluck(obj, path);
      if (value !== undefined) return { path, value };
    } catch {
      // try next
    }
  }
  return null;
}

/** Truthy-summary of a value for terminal-friendly logging. */
export function summarise(v: unknown, max = 80): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v.length > max ? `${v.slice(0, max)}…` : v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === "object") return `object{${Object.keys(v as object).slice(0, 6).join(",")}${Object.keys(v as object).length > 6 ? ",…" : ""}}`;
  return String(v);
}
