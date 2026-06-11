/**
 * "Fine print" — the tenancy-relevant facts the portals expose but
 * never surface front-and-centre:
 *   - Deposit
 *   - Minimum term + let type
 *   - Available from
 *   - Furnished status
 *   - Council tax band
 *   - Bills included
 *   - Service charge / ground rent (leasehold)
 *
 * The agent name / phone is deliberately *not* shown: a cluster pools
 * listings from several portals, each of which may have a different
 * estate agent, so attributing one agent to the merged listing would be
 * misleading. The Tenant Fees Act "permitted payments" disclosure lives
 * with the other agent disclosures (see `property-facts.tsx`), not here.
 *
 * Everything renders as a definition list; rows with no value are
 * skipped so we don't paint a column of "—".
 */
import type { ListingDetailFineprint } from "../../server/functions/listing-detail";
import { SectionLabel } from "./section-label";

type Props = {
  fineprint: ListingDetailFineprint;
};

type DefRow = { label: string; value: string };

function formatPounds(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return `£${value.toLocaleString("en-GB")}`;
}

function formatAvailableFrom(value: string | null): string | null {
  if (!value) {
    return null;
  }
  // Best-effort: ISO date → "13 Jul 2026". Anything we can't parse
  // surfaces verbatim.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFurnished(
  value: ListingDetailFineprint["furnished"]
): string | null {
  if (!value) {
    return null;
  }
  if (value === "furnished") {
    return "Furnished";
  }
  if (value === "unfurnished") {
    return "Unfurnished";
  }
  return "Part-furnished";
}

function buildRows(fp: ListingDetailFineprint): DefRow[] {
  const rows: DefRow[] = [];
  const push = (label: string, value: string | null) => {
    if (value) {
      rows.push({ label, value });
    }
  };
  push("Deposit", formatPounds(fp.deposit));
  if (fp.minimumTermMonths !== null) {
    push(
      "Min. tenancy",
      `${fp.minimumTermMonths} month${fp.minimumTermMonths === 1 ? "" : "s"}`
    );
  }
  push("Let type", fp.letType);
  push("Available from", formatAvailableFrom(fp.availableFrom));
  push("Furnished", formatFurnished(fp.furnished));
  // Band only shown here when we have no full estimate table to render
  // (the table below highlights the band itself when present).
  if (!fp.councilTax) {
    push("Council tax band", fp.councilTaxBand);
  }
  if (fp.billsIncluded !== null) {
    push("Bills included", fp.billsIncluded ? "Yes" : "No");
  }
  push("Service charge", formatPounds(fp.serviceChargeAnnual));
  push("Ground rent", formatPounds(fp.groundRentAnnual));
  return rows;
}

function CouncilTaxTable({
  councilTax,
}: {
  councilTax: NonNullable<ListingDetailFineprint["councilTax"]>;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
      <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
        Council tax · {councilTax.authority} · {councilTax.year}
      </p>
      <ul className="flex flex-col">
        {councilTax.bands.map((b) => {
          const isListing = b.band === councilTax.listingBand;
          return (
            <li
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] ${
                isListing
                  ? "bg-primary/10 font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
              key={b.band}
            >
              <span className="w-14 shrink-0">Band {b.band}</span>
              {isListing ? (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px font-medium text-[9px] text-primary uppercase tracking-[0.06em]">
                  This home
                </span>
              ) : null}
              <span className="ml-auto shrink-0 tabular-nums">
                ~£{b.annualPounds.toLocaleString("en-GB")}/yr
              </span>
              <span className="w-20 shrink-0 text-right tabular-nums">
                ~£{b.monthlyPounds.toLocaleString("en-GB")}/mo
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground leading-[140%]">
        Approximate — derived from {councilTax.authority}'s area Band D;
        parish precepts vary within the area.
      </p>
    </div>
  );
}

/** True when the fineprint has at least one renderable block. */
function hasFineprint(fineprint: ListingDetailFineprint): boolean {
  return buildRows(fineprint).length > 0 || Boolean(fineprint.councilTax);
}

/** The fineprint blocks (def-list + council tax), shared by the mobile section
 * and the desktop card. Each block is its own bordered sub-card, so neither
 * shell adds an outer border. */
function FineprintBody({ fineprint }: Props) {
  const rows = buildRows(fineprint);
  return (
    <>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-line bg-card p-4">
          {rows.map((row) => (
            <div className="flex flex-col gap-0.5" key={row.label}>
              <dt className="text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
                {row.label}
              </dt>
              <dd className="font-medium text-[14px] text-foreground leading-[120%]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {fineprint.councilTax ? (
        <CouncilTaxTable councilTax={fineprint.councilTax} />
      ) : null}
    </>
  );
}

/** Mobile-shell variant: bare section, blocks supply their own card chrome. */
export function Fineprint({ fineprint }: Props) {
  if (!hasFineprint(fineprint)) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-7">
      <SectionLabel>Tenancy terms · fine print</SectionLabel>
      <FineprintBody fineprint={fineprint} />
    </section>
  );
}

/** Desktop variant: a group of the same bordered blocks (no outer border —
 * the blocks are already cards, so wrapping would double-border). No section
 * label: the side-rail blocks read for themselves. */
export function FineprintCard({ fineprint }: Props) {
  if (!hasFineprint(fineprint)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3.5">
      <FineprintBody fineprint={fineprint} />
    </div>
  );
}
