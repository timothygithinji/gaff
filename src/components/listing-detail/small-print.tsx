/**
 * "Watch-outs" — AI-extracted negatives a renter should know.
 *
 * Each entry has a severity: caution / problem. Rendered from
 * `enrichments.features.watchouts` (v2 schema).
 *
 * Component name + file path preserved from v1 (`SmallPrint`).
 * Paper (mobile 2T3-0 "In the small print · Claude read"): slate eyebrow,
 * white card (radius 6, hairline), each row a copper warning triangle +
 * 13px label + 11px slate-2 detail.
 */
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListingDetailWatchout } from "../../server/functions/listing-detail";
import { SectionLabel } from "./section-label";

type Props = {
  items: ListingDetailWatchout[];
};

export function SmallPrint({ items }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>In the small print · Claude read</SectionLabel>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-5 text-center text-[12px] text-slate-2">
          Reading the description… watch-outs will appear here once enrichment
          runs.
        </div>
      ) : (
        <ul className="flex flex-col rounded-md border border-line bg-card px-4">
          {items.map((item, idx) => (
            <li
              className={`flex items-start gap-2.5 py-3.5 ${idx < items.length - 1 ? "border-mist border-b" : ""}`}
              key={`${item.severity}:${item.label}:${idx}`}
            >
              <HugeiconsIcon
                className={
                  item.severity === "problem"
                    ? "mt-px shrink-0 text-destructive"
                    : "mt-px shrink-0 text-warning"
                }
                icon={Alert02Icon}
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
