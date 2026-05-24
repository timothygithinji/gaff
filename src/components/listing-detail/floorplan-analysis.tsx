/**
 * Floor plan card — shows the floor plan image scraped from the portal.
 *
 * v1 also rendered an AI-extracted "room readout" overlay (top-left
 * Kitchen, top-right Bed 1, …) plus GIA in sq m. That readout was
 * hallucinated — Claude Haiku 4.5 runs in text-only mode in this app
 * and cannot OCR a floorplan PNG, so the room sizes were either fake
 * or extracted from rare descriptions that bothered to list them. v2
 * drops the readout. If we want it back we'll need a vision-enabled
 * prompt (`image_url` content block) or an actual OCR pass.
 *
 * When the portal didn't expose a floor plan URL, the card shows a
 * "Floor plan not available" placeholder — surfaces the absence
 * honestly rather than rendering a fake schematic.
 */
import { FloorPlanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  floorplan?: { url: string };
};

export function FloorplanAnalysis({ floorplan }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon
              className="text-primary"
              icon={FloorPlanIcon}
              size={12}
              strokeWidth={2}
            />
            <span className="font-semibold text-[10px] text-primary uppercase tracking-[0.12em]">
              Floor plan
            </span>
          </div>
          <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
            How it lays out
          </h2>
        </div>
      </header>

      {floorplan?.url ? (
        <a
          className="block overflow-hidden rounded-[14px] border border-border bg-card"
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
        <div className="flex h-40 w-full items-center justify-center rounded-[14px] border border-border bg-card">
          <p className="text-muted-foreground text-sm">
            Floor plan not available
          </p>
        </div>
      )}
    </section>
  );
}
