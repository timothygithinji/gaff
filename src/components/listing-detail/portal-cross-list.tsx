/**
 * "Same property · N portals" section — the mobile listing-detail placement
 * of the per-portal price spread. Owns only the section chrome and the
 * "single portal → no card" rule; the rows, delta/cheapest logic and badges
 * live in the shared {@link PortalList} primitive (`variant="card"`).
 */
import type { ListingDetailPortalRow } from "../../server/functions/listing-detail";
import { PortalList, toPortalRows } from "../ui/patterns/portal-list";
import { SectionLabel } from "./section-label";

type Props = {
  portals: ListingDetailPortalRow[];
};

export function PortalCrossList({ portals }: Props) {
  if (portals.length < 2) {
    // Only one portal — the cross-list card disappears; the header row on
    // the page already says "N portals tracking" so there's no gap.
    return null;
  }

  const { rows, hasSpread } = toPortalRows(portals);

  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      {/* Hard-coded "100%" — clustering matched the property or it didn't. */}
      <SectionLabel>Same property · 100% match</SectionLabel>
      <PortalList hasSpread={hasSpread} rows={rows} variant="card" />
    </section>
  );
}
