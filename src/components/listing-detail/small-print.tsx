/**
 * "Watch-outs" — AI-extracted negatives a renter should know.
 *
 * Each entry has a severity: caution / problem. Rendered from
 * `enrichments.features.watchouts` (v2 schema). Component name + file path
 * preserved from v1 (`SmallPrint`). Section chrome lives here; the rows
 * render through the shared {@link FeatureList} (severity-tinted icons).
 */
import type { ListingDetailWatchout } from "../../server/functions/listing-detail";
import { FeatureList, watchoutsToPills } from "../ui/patterns/feature-pills";
import { SectionLabel } from "./section-label";

type Props = {
  items: ListingDetailWatchout[];
};

export function SmallPrint({ items }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>In the small print · Claude read</SectionLabel>

      <FeatureList
        emptyHint="Reading the description… watch-outs will appear here once enrichment runs."
        items={watchoutsToPills(items)}
      />
    </section>
  );
}
