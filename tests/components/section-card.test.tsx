/**
 * Contract test for the shared section primitives. Like costs.test.tsx we
 * assert on `renderToStaticMarkup` output rather than pulling in a DOM
 * testing library — enough to pin the card-vs-bare arrangement and that the
 * variant prop (not device detection) drives the chrome.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Section,
  SectionCard,
} from "../../src/components/ui/patterns/section-card";

describe("SectionCard", () => {
  it("draws card chrome for variant=card (the default)", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Postcodes">
        <span>body</span>
      </SectionCard>
    );
    expect(html).toContain("rounded-lg");
    expect(html).toContain("border-line");
    expect(html).toContain("bg-paper");
    expect(html).not.toContain("px-5");
    expect(html).toContain("Postcodes");
    expect(html).toContain("body");
  });

  it("drops card chrome and insets for variant=bare", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Postcodes" variant="bare">
        <span>body</span>
      </SectionCard>
    );
    expect(html).toContain("px-5");
    expect(html).not.toContain("rounded-lg");
    expect(html).not.toContain("bg-paper");
  });

  it("renders titleRight alongside the title", () => {
    const html = renderToStaticMarkup(
      <SectionCard title="Price" titleRight={<button type="button">edit</button>}>
        <span>body</span>
      </SectionCard>
    );
    expect(html).toContain("Price");
    expect(html).toContain("edit");
  });
});

describe("Section", () => {
  it("insets only for variant=bare and shows the subtitle", () => {
    const bare = renderToStaticMarkup(
      <Section subtitle="Tap to add" title="Property type" variant="bare">
        <span>body</span>
      </Section>
    );
    expect(bare).toContain("px-5");
    expect(bare).toContain("Tap to add");

    const card = renderToStaticMarkup(
      <Section title="Property type">
        <span>body</span>
      </Section>
    );
    expect(card).not.toContain("px-5");
  });
});
