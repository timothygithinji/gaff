/**
 * Unit tests for portal-HTML → text conversion.
 *
 * Portals ship listing copy in two incompatible shapes: Rightmove wraps
 * each paragraph in `<p>…</p>`, while Zoopla / OpenRent string everything
 * with `<br>` (double for a paragraph break, single for a line break).
 * Both must land as clean paragraphs with every tag stripped and entities
 * decoded — and never as raw HTML.
 */

import { describe, expect, it } from "vitest";
import { htmlToParagraphs, htmlToPlainText } from "./html-text";

describe("htmlToParagraphs", () => {
  it("splits Rightmove <p>-wrapped copy into one paragraph each", () => {
    const html = "<p>First para.</p><p>Second para.</p>";
    expect(htmlToParagraphs(html)).toEqual(["First para.", "Second para."]);
  });

  it("treats double <br> as a paragraph break and single <br> as a line break", () => {
    const html = "Intro line.<br><br>Body para line one.<br>Body para line two.";
    expect(htmlToParagraphs(html)).toEqual([
      "Intro line.",
      "Body para line one.\nBody para line two.",
    ]);
  });

  it("drops empty <p> </p> paragraphs and self-closing <br /> variants", () => {
    const html = "<p> </p>Deposit: 5 Weeks <br />Rent: As agreed <p> </p>";
    expect(htmlToParagraphs(html)).toEqual([
      "Deposit: 5 Weeks\nRent: As agreed",
    ]);
  });

  it("strips inline tags and decodes entities", () => {
    const html = "<strong>Description</strong><br><br>Bath &amp; shower &lt;new&gt;.";
    expect(htmlToParagraphs(html)).toEqual([
      "Description",
      "Bath & shower <new>.",
    ]);
  });

  it("strips script tags (content survives as inert text, markup does not)", () => {
    const html = "<p>Safe.</p><script>alert(1)</script>";
    const out = htmlToParagraphs(html).join(" ");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("</script>");
  });

  it("returns an empty list for whitespace-only markup", () => {
    expect(htmlToParagraphs("<p> </p><br /> &nbsp; ")).toEqual([]);
  });
});

describe("htmlToPlainText", () => {
  it("joins paragraphs with a blank line", () => {
    expect(htmlToPlainText("<p>One.</p><p>Two.</p>")).toBe("One.\n\nTwo.");
  });
});
