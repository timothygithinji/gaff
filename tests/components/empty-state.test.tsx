import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "../../src/components/ui/patterns/empty-state";

describe("EmptyState", () => {
  it("card variant renders centered chrome with title, body and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        action={<a href="/searches">Tune searches</a>}
        body="New listings land here."
        eyebrow="Queue · empty"
        title="All caught up"
      />
    );
    expect(html).toContain("text-center");
    expect(html).toContain("Queue · empty");
    expect(html).toContain("All caught up");
    expect(html).toContain("Tune searches");
    expect(html).not.toContain("border-dashed");
  });

  it("inline variant renders the dashed rail box", () => {
    const html = renderToStaticMarkup(
      <EmptyState eyebrow="Queue · filtered" variant="inline" />
    );
    expect(html).toContain("border-dashed");
    expect(html).not.toContain("text-center");
  });

  it("omits the eyebrow when not given (desktop no-match)", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        action={<button type="button">Clear filters</button>}
        body="No queued listings match these filters."
        variant="inline"
      />
    );
    expect(html).toContain("No queued listings match");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("uppercase");
  });
});
