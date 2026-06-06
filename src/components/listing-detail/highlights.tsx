/**
 * "What stands out" — AI-extracted positives a renter would care about.
 *
 * Rendered from `enrichments.features.highlights` (v2 schema). Section chrome
 * (eyebrow + optional summary) lives here; the rows render through the shared
 * {@link FeatureList} so highlights, watch-outs and the review pills can't
 * drift apart.
 */
import type { ListingDetailHighlight } from "../../server/functions/listing-detail";
import { FeatureList, highlightsToPills } from "../ui/patterns/feature-pills";
import { SectionLabel } from "./section-label";

type Props = {
  items: ListingDetailHighlight[];
  summary?: string | null;
};

export function Highlights({ items, summary }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>What stands out · Claude read</SectionLabel>

      {summary ? (
        <p className="text-[13px] text-slate leading-[19px]">{summary}</p>
      ) : null}

      <FeatureList
        emptyHint="Reading the description… highlights will appear here once enrichment runs."
        items={highlightsToPills(items)}
      />
    </section>
  );
}
