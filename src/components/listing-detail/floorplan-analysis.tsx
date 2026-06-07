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
import { File01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SectionLabel } from "./section-label";

type Props = {
  floorplan?: { url: string };
  /** Internal area in square feet, when a portal reported it. */
  sizeSqFt?: number | null;
  /** Agent brochure PDF, when a portal exposed one (parity with desktop). */
  brochureUrl?: string | null;
};

const HTTP_URL_RE = /^https?:\/\//i;

export function FloorplanAnalysis({ floorplan, sizeSqFt, brochureUrl }: Props) {
  const brochureHref =
    brochureUrl && HTTP_URL_RE.test(brochureUrl) ? brochureUrl : null;
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <header className="flex items-center justify-between">
        <SectionLabel>
          {brochureHref ? "Floor plan & media" : "Floor plan"}
        </SectionLabel>
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

      {brochureHref ? (
        <a
          className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-3 transition-colors hover:border-steel hover:bg-ground"
          href={brochureHref}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mist text-slate">
            <HugeiconsIcon icon={File01Icon} size={16} strokeWidth={1.6} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-medium text-[13px] text-foreground leading-4">
              Agent brochure
            </span>
            <span className="text-[11px] text-slate leading-[14px]">
              PDF · opens on the portal site
            </span>
          </span>
          <HugeiconsIcon
            className="ml-auto shrink-0 text-slate"
            icon={LinkSquare01Icon}
            size={14}
            strokeWidth={1.6}
          />
        </a>
      ) : null}
    </section>
  );
}
