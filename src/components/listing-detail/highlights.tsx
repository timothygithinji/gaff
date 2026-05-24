/**
 * "Why it's worth a look" — AI-extracted positives a renter would care
 * about.
 *
 * Rendered from `enrichments.features.highlights` (v2 schema). Each
 * entry has a `label` + optional `detail`. The card sits above the
 * watch-outs section in the listing-detail layout so a glance gives
 * "positives ↦ negatives" in reading order.
 *
 * Falls back to a placeholder when the AI hasn't run yet.
 */
import { SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListingDetailHighlight } from "../../server/functions/listing-detail";

type Props = {
  items: ListingDetailHighlight[];
  summary?: string | null;
};

export function Highlights({ items, summary }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            className="text-primary"
            icon={SparklesIcon}
            size={12}
            strokeWidth={2}
          />
          <span className="font-semibold text-[10px] text-primary uppercase tracking-[0.12em]">
            Why it's worth a look
          </span>
        </div>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          Highlights
        </h2>
      </header>

      {summary ? (
        <p className="text-[14px] text-muted-foreground leading-[140%]">
          {summary}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted p-5 text-center text-muted-foreground text-sm">
          Reading the description… highlights will appear here once enrichment
          runs.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <li
              className="flex items-start gap-2.5"
              key={`${item.label}:${idx}`}
            >
              <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} />
              </div>
              <div className="flex grow basis-0 flex-col gap-0.5">
                <p className="font-medium text-[14px] text-foreground leading-[135%]">
                  {item.label}
                </p>
                {item.detail ? (
                  <p className="text-[12px] text-muted-foreground leading-[140%]">
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
