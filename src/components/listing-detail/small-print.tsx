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
import type { ListingDetailSmallPrintItem } from "../../server/functions/listing-detail";

type Props = {
  items: ListingDetailSmallPrintItem[];
};

function SeverityChip({
  severity,
}: { severity: "ok" | "caution" | "problem" }) {
  if (severity === "ok") {
    return (
      <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-[#DCE6D5]">
        <svg
          className="text-[#3F5A2E]"
          fill="none"
          height="10"
          role="img"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          viewBox="0 0 24 24"
          width="10"
        >
          <title>OK</title>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (severity === "caution") {
    return (
      <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-[#F4E8DE]">
        <span className="font-bold font-serif text-[11px] text-copper">●</span>
      </div>
    );
  }
  return (
    <div className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-md bg-[#F4E0DE]">
      <span className="font-bold text-[#8C3A35] text-[11px]">!</span>
    </div>
  );
}

export function SmallPrint({ items }: Props) {
  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="text-[11px] text-copper">
            ✦
          </span>
          <span className="font-semibold text-[10px] text-copper uppercase tracking-[0.12em]">
            Description read · Haiku
          </span>
        </div>
        <h2 className="font-medium font-serif text-[22px] text-ink leading-[130%] tracking-[-0.02em]">
          What's in the small print
        </h2>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-bone p-5 text-center text-brass text-sm">
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
                <p className="font-medium text-[14px] text-ink leading-[135%]">
                  {item.label}
                </p>
                {item.note ? (
                  <p className="text-[12px] text-brass leading-[140%]">
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
