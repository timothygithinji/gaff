/**
 * "About this property" — the agent's free-text listing description.
 *
 * Portals ship this as raw HTML (`<p>`-wrapped on Rightmove, `<br>`-strung
 * on Zoopla / OpenRent). We convert it to clean paragraphs via
 * {@link htmlToParagraphs} and render them as ordinary `<p>` nodes — the
 * markup is stripped, never injected, so untrusted agent copy can't carry
 * a script through. Renders nothing when there's no description to show.
 */

import { htmlToParagraphs } from "../../lib/html-text";
import { SectionLabel } from "./section-label";

type Props = {
  description?: string | null;
};

function DescriptionBody({ description }: { description: string }) {
  const paragraphs = htmlToParagraphs(description);
  if (paragraphs.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {paragraphs.map((paragraph, index) => (
        <p
          className="whitespace-pre-line text-[13px] text-slate leading-[19px]"
          key={`${index}:${paragraph.slice(0, 24)}`}
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function hasBody(description?: string | null): description is string {
  return typeof description === "string" && description.trim().length > 0;
}

/** Mobile shell — bare section, no card chrome. */
export function Description({ description }: Props) {
  if (!hasBody(description)) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>About this property</SectionLabel>
      <div className="rounded-md border border-line bg-card p-4">
        <DescriptionBody description={description} />
      </div>
    </section>
  );
}

/** Desktop variant: single bordered card to match `<PropertyFactsCard>` etc. */
export function DescriptionCard({ description }: Props) {
  if (!hasBody(description)) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-line bg-card p-6">
      <SectionLabel>About this property</SectionLabel>
      <DescriptionBody description={description} />
    </article>
  );
}
