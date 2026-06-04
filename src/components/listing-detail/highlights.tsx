/**
 * "What stands out" — AI-extracted positives a renter would care about.
 *
 * Rendered from `enrichments.features.highlights` (v2 schema). Each entry
 * has a `label` + optional `detail`. Sits above the watch-outs section so
 * a glance reads "positives ↦ negatives".
 *
 * Paper (mobile 2T3-0 floor-plan + highlights cards): slate eyebrow
 * "FLOOR PLAN · CLAUDE READ" (11px/400/0.14em), then a white card (radius
 * 6, hairline #c9d3dc) of rows divided by #eef1f4, each row a copper
 * square-tick icon + 13px label + 11px slate-2 detail.
 */
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListingDetailHighlight } from "../../server/functions/listing-detail";
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

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-5 text-center text-[12px] text-slate-2">
          Reading the description… highlights will appear here once enrichment
          runs.
        </div>
      ) : (
        <ul className="flex flex-col rounded-md border border-line bg-card px-4">
          {items.map((item, idx) => (
            <li
              className={`flex items-start gap-2.5 py-3.5 ${idx < items.length - 1 ? "border-mist border-b" : ""}`}
              key={`${item.label}:${idx}`}
            >
              <HugeiconsIcon
                className="mt-px shrink-0 text-success"
                icon={Tick02Icon}
                size={16}
                strokeWidth={1.8}
              />
              <div className="flex grow basis-0 flex-col gap-0.5">
                <p className="font-medium text-[13px] text-foreground leading-4">
                  {item.label}
                </p>
                {item.detail ? (
                  <p className="text-[11px] text-slate-2 leading-[14px]">
                    {item.detail}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
