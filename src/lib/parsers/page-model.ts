/**
 * Rightmove embeds its detail-page data as:
 *
 *   window.__PAGE_MODEL = { data: "[...]", encoding: "on" };
 *
 * Inside `data` is a JSON-stringified array (the "pool"). `pool[0]` is
 * the root object; every VALUE in any contained object/array is an
 * integer index pointing back into the same pool — including primitives
 * (numbers, strings, booleans). Object KEYS are inline strings; only
 * VALUES are pooled. Cycles are handled via a per-resolve memo.
 *
 * Promoted from `scripts/verify/lib/rightmove-page-model.ts`.
 */

const WHITESPACE_RE = /\s/;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: hand-written character-level parser; refactor would obscure intent.
export function extractRightmoveModel(html: string): unknown {
  const start = html.indexOf("window.__PAGE_MODEL");
  if (start === -1) {
    throw new Error("window.__PAGE_MODEL not found");
  }
  const eq = html.indexOf("=", start);
  let i = eq + 1;
  while (i < html.length && WHITESPACE_RE.test(html[i] as string)) {
    i++;
  }
  if (html[i] !== "{") {
    throw new Error("expected '{' after = in __PAGE_MODEL");
  }
  let depth = 0;
  const startObj = i;
  while (i < html.length) {
    const c = html[i];
    if (c === '"') {
      i++;
      while (i < html.length) {
        if (html[i] === "\\") {
          i += 2;
          continue;
        }
        if (html[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        const src = html.slice(startObj, i + 1);
        const wrapper = JSON.parse(src) as {
          data: string;
          encoding?: string;
        };
        const pool = JSON.parse(wrapper.data) as unknown[];
        return resolveFromPool(pool, 0);
      }
    }
    i++;
  }
  throw new Error("unbalanced __PAGE_MODEL braces");
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tightly-coupled to pool format; flattening would not improve clarity.
function resolveFromPool(
  pool: unknown[],
  idx: number,
  memo = new Map<number, unknown>()
): unknown {
  if (memo.has(idx)) {
    return memo.get(idx);
  }
  const raw = pool[idx];
  if (raw === null || raw === undefined) {
    memo.set(idx, raw);
    return raw;
  }
  if (
    typeof raw === "string" ||
    typeof raw === "boolean" ||
    typeof raw === "number"
  ) {
    memo.set(idx, raw);
    return raw;
  }
  if (Array.isArray(raw)) {
    const out: unknown[] = [];
    memo.set(idx, out);
    for (const item of raw) {
      if (typeof item === "number") {
        out.push(resolveFromPool(pool, item, memo));
      } else {
        out.push(item);
      }
    }
    return out;
  }
  if (typeof raw === "object") {
    const out: Record<string, unknown> = {};
    memo.set(idx, out);
    for (const [k, v] of Object.entries(raw as object)) {
      if (typeof v === "number") {
        out[k] = resolveFromPool(pool, v, memo);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  memo.set(idx, raw);
  return raw;
}
