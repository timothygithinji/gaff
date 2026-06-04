/**
 * Floor plan card — shows the floor plan image scraped from the portal.
 *
 * v1 rendered a hallucinated AI room-readout overlay; v2 drops it (the
 * text-only model can't OCR a PNG). When the portal didn't expose a floor
 * plan URL, the card shows an honest placeholder.
 *
 * Paper (mobile 2T3-0 floor-plan header): slate eyebrow "FLOOR PLAN ·
 * CLAUDE READ" with a copper "Open plan ⏵" affordance on the right, then
 * the plan inside a white card (radius 6, hairline).
 */
type Props = {
  floorplan?: { url: string };
  /** Internal area in square feet, when a portal reported it. */
  sizeSqFt?: number | null;
};

import { SectionLabel } from "./section-label";

export function FloorplanAnalysis({ floorplan, sizeSqFt }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <header className="flex items-center justify-between">
        <SectionLabel>Floor plan</SectionLabel>
        {sizeSqFt ? (
          <span className="font-medium text-[11px] text-slate-2">
            {sizeSqFt.toLocaleString("en-GB")} sq ft
          </span>
        ) : null}
      </header>

      {floorplan?.url ? (
        <a
          className="block overflow-hidden rounded-md border border-line bg-card"
          href={floorplan.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
          <img
            alt="Floor plan from the listing"
            className="h-full max-h-[420px] w-full object-contain"
            src={floorplan.url}
          />
        </a>
      ) : (
        <div className="flex h-[180px] w-full items-center justify-center rounded-md border border-line bg-card">
          <p className="text-[12px] text-slate-2">Floor plan not available</p>
        </div>
      )}
    </section>
  );
}
