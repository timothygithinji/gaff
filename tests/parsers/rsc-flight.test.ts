import { describe, expect, it } from "vitest";
import {
  parseFlight,
  resolveFlightRef,
} from "../../src/lib/parsers/rsc-flight";

// Helper: build the literal HTML chunk Zoopla emits. The payload string
// goes through JSON.stringify so escape rules match what real pages
// produce after their server serialisation.
function flightHtml(payload: string): string {
  return `<script>self.__next_f.push([1, ${JSON.stringify(payload)}])</script>`;
}

describe("parseFlight", () => {
  it("parses plain JSON rows", () => {
    const html = flightHtml('1:{"a":1}\n2:[3,4]\n3:"hello"\n');
    const map = parseFlight(html);
    expect(map.get("1")).toEqual({ a: 1 });
    expect(map.get("2")).toEqual([3, 4]);
    expect(map.get("3")).toBe("hello");
  });

  it("parses T-tagged text rows using the declared byte length", () => {
    // 'A spacious modern' is 17 ASCII bytes → 0x11.
    const text = "A spacious modern";
    const html = flightHtml(`77:T11,${text}\n`);
    const map = parseFlight(html);
    expect(map.get("77")).toBe(text);
  });

  it("counts UTF-8 bytes, not characters, for T rows", () => {
    // '£' is 2 UTF-8 bytes → total 5 bytes (£2300) for 5-char string.
    const text = "£2300";
    const utf8Len = new TextEncoder().encode(text).length;
    const html = flightHtml(`5:T${utf8Len.toString(16)},${text}\n`);
    const map = parseFlight(html);
    expect(map.get("5")).toBe(text);
  });

  it("keeps parsing later rows after a malformed JSON row", () => {
    // The bad row has no closing brace — pre-fix this killed the whole
    // payload; now it should only drop this single row.
    const html = flightHtml('1:{"oops":\n2:"ok"\n');
    const map = parseFlight(html);
    expect(map.get("2")).toBe("ok");
  });

  it("keeps parsing later rows after a tagged metadata row (I/L/M)", () => {
    const html = flightHtml('1:I["abc","def"]\n2:"after-meta"\n');
    const map = parseFlight(html);
    expect(map.get("2")).toBe("after-meta");
  });

  it("aggregates multiple __next_f.push payloads", () => {
    const html = `${flightHtml('1:"first"\n')}${flightHtml('2:"second"\n')}`;
    const map = parseFlight(html);
    expect(map.get("1")).toBe("first");
    expect(map.get("2")).toBe("second");
  });
});

describe("resolveFlightRef", () => {
  it("returns plain (non-reference) values unchanged", () => {
    const map = new Map<string, unknown>([["1", "hello"]]);
    expect(resolveFlightRef(map, "hello")).toBe("hello");
    expect(resolveFlightRef(map, 42)).toBe(42);
    expect(resolveFlightRef(map, { a: 1 })).toEqual({ a: 1 });
  });

  it("follows a $<id> reference to its target chunk", () => {
    const map = new Map<string, unknown>([["77", "the actual description"]]);
    expect(resolveFlightRef(map, "$77")).toBe("the actual description");
  });

  it("returns undefined when the reference target is missing", () => {
    const map = new Map<string, unknown>();
    expect(resolveFlightRef(map, "$99")).toBeUndefined();
  });

  it("follows chained references", () => {
    const map = new Map<string, unknown>([
      ["a", "$b"],
      ["b", "$c"],
      ["c", "final"],
    ]);
    expect(resolveFlightRef(map, "$a")).toBe("final");
  });

  it("stops following cycles without overflowing", () => {
    const map = new Map<string, unknown>([
      ["a", "$b"],
      ["b", "$a"],
    ]);
    // After MAX_REF_DEPTH hops it bails — returning whatever string it
    // last saw. We don't care which one, only that it doesn't loop.
    const result = resolveFlightRef(map, "$a");
    expect(typeof result).toBe("string");
  });
});
