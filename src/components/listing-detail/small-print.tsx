/**
 * "What's in the small print" — list of AI-extracted lease / bills /
 * restriction items, each with a severity-driven icon:
 *
 *   ok      — green check chip
 *   caution — amber dot chip
 *   problem — red exclamation chip
 *
 * Rendered from `enrichments.features.smallPrint`. Falls back to a
 * gentle placeholder when the AI hasn't run yet (so the section is
 * never simply absent — the design surfaces "Reading description…"
 * to communicate that more detail is coming).
 */
import {
  Alert01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListingDetailSmallPrintItem } from "../../server/functions/listing-detail";

type Props = {
  items: ListingDetailSmallPrintItem[];
};

function SeverityChip({
  severity,
}: { severity: "ok" | "caution" | "problem" }) {
  if (severity === "ok") {
    return (
      <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
        <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} />
      </div>
    );
  }
  if (severity === "caution") {
    return (
      <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <span className="font-bold font-serif text-[11px]">●</span>
      </div>
    );
  }
  return (
    <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-destructive/15 text-destructive">
      <HugeiconsIcon icon={Alert01Icon} size={12} strokeWidth={2.5} />
    </div>
  );
}

export function SmallPrint({ items }: Props) {
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
            Description read
          </span>
        </div>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          What's in the small print
        </h2>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted p-5 text-center text-muted-foreground text-sm">
          Reading the description… smallprint will appear here once enrichment
          runs.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, idx) => (
            <li
              className="flex items-start gap-2.5"
              key={`${item.severity}:${item.label}:${idx}`}
            >
              <SeverityChip severity={item.severity} />
              <div className="flex grow basis-0 flex-col gap-0.5">
                <p className="font-medium text-[14px] text-foreground leading-[135%]">
                  {item.label}
                </p>
                {item.note ? (
                  <p className="text-[12px] text-muted-foreground leading-[140%]">
                    {item.note}
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
