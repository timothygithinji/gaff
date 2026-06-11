/**
 * "What stands out" — AI-extracted positives and watch-outs in one section.
 *
 * Rendered from `enrichments.features.highlights` + `.watchouts` (v2 schema).
 * Highlights (green ticks) and watch-outs (copper/red alerts) render together
 * through the shared {@link FeatureList}, severity-tinted so the negatives stay
 * distinct. Mirrors the desktop tree's combined "What stands out" card so the
 * two devices show the same data set (one section, not split positives /
 * small-print). Section chrome (eyebrow + optional summary) lives here.
 */
import type {
  ListingDetailHighlight,
  ListingDetailWatchout,
} from "../../server/functions/listing-detail";
import {
  FeatureList,
  highlightsToPills,
  watchoutsToPills,
} from "../ui/patterns/feature-pills";
import { SectionLabel } from "./section-label";

type Props = {
  items: ListingDetailHighlight[];
  watchouts: ListingDetailWatchout[];
  summary?: string | null;
};

export function Highlights({ items, watchouts, summary }: Props) {
  const pills = [...highlightsToPills(items), ...watchoutsToPills(watchouts)];
  // Mirror desktop's AiCard: render nothing until enrichment yields a summary
  // or at least one pill. A summary with no pills shows the summary alone (the
  // `FeatureList` renders null) — never the "enrichment hasn't run" placeholder,
  // which contradicts a summary that proves it has.
  if (pills.length === 0 && !summary) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>What stands out</SectionLabel>

      {summary ? (
        <p className="text-[13px] text-slate leading-[19px]">{summary}</p>
      ) : null}

      <FeatureList items={pills} />
    </section>
  );
}
