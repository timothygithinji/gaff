/**
 * Consolidated "Costs" section.
 *
 * The listing detail page previously scattered the costs of renting a
 * property across three places: the price card showed monthly rent, the
 * fineprint listed deposit / fees / service charge / ground rent, and
 * the council-tax table sat lower down. To compare two listings you had
 * to mentally aggregate all of these. This component flattens them into
 * one ordered list with a running "true monthly" total beneath, so the
 * decision-relevant number is visible at a glance.
 *
 * What's included in the total:
 *   - Rent (monthly).
 *   - Council tax (monthly, when the listing has a known band; we don't
 *     guess for unknown bands — surfacing 0 would skew the total).
 *   - Service charge ÷ 12 (when stated; leasehold flats only).
 *   - Ground rent ÷ 12 (same).
 *   - Deposit amortised over the minimum term (so a £3,200 deposit on
 *     a 12-month tenancy reads as £267/mo). Skipped when either side
 *     is unknown — better to omit than amortise over a guess.
 *
 * Deliberately NOT included:
 *   - Bills. The bills-included flag IS shown (with the right tone)
 *     but no estimate gets added to the total. Bill estimates depend
 *     on usage and bedrooms in ways this layer can't model honestly;
 *     surfacing a fake number would make two listings look comparable
 *     when they aren't.
 *   - Tenancy fees text. Illegal under the Tenant Fees Act 2019; the
 *     fineprint section already exposes it for the renter to read.
 *
 * Two presentations of the same content:
 *   - `<Costs>` — the mobile listing detail shell. Section + serif
 *     heading + bottom-spacing pattern, matches the surrounding
 *     `<PublicRecords>` / `<Fineprint>` siblings.
 *   - `<CostsCard>` — the desktop InfoColumn shell. Same internals
 *     wrapped in the bordered card chrome to match `<AiCard>` /
 *     `<RecordsCard>`.
 */

import type {
  ListingDetailCouncilTax,
  ListingDetailFineprint,
} from "../../server/functions/listing-detail";

type Props = {
  /** Monthly rent, in pounds. */
  priceMonthly: number | null;
  fineprint: ListingDetailFineprint;
};

type Row = {
  label: string;
  /** Display string for the monthly amount, e.g. "£1,900". */
  monthlyText: string;
  /** Sub-line — e.g. "amortised over 12 months". Optional. */
  sub?: string;
  /** When set, the row is informational only and not added to the total. */
  informational?: boolean;
};

type Computed = {
  rows: Row[];
  monthlyTotal: number;
  totalHasUnknowns: boolean;
};

function computeCosts({ priceMonthly, fineprint }: Props): Computed {
  const rows: Row[] = [];
  let monthlyTotal = 0;
  let totalHasUnknowns = false;

  // Rent — always first, always included. When priceMonthly is null
  // the caller renders no section at all (no useful total possible).
  if (priceMonthly !== null) {
    rows.push({ label: "Rent", monthlyText: formatMoney(priceMonthly) });
    monthlyTotal += priceMonthly;
  }

  // Council tax — explicit exemption beats a band lookup. Rightmove
  // sometimes flags an exempt property (e.g. all-bills HMO) where a
  // band would otherwise still resolve a non-zero figure.
  if (fineprint.councilTaxExempt === true) {
    rows.push({
      label: "Council tax",
      monthlyText: "Exempt",
      sub: "landlord-disclosed",
      informational: true,
    });
  }
  // Council tax — only when the listing's specific band is known.
  // Falling back to Band D when the band is unknown would silently
  // round £1,500/yr properties up to £2,200/yr ones (or down).
  const ctMonthly =
    fineprint.councilTaxExempt === true
      ? null
      : pickCouncilTaxMonthly(fineprint.councilTax);
  if (ctMonthly !== null) {
    rows.push({
      label: "Council tax",
      monthlyText: formatMoney(ctMonthly),
      sub: councilTaxSub(fineprint.councilTax),
    });
    monthlyTotal += ctMonthly;
  } else if (fineprint.councilTax && fineprint.councilTaxExempt !== true) {
    // Authority known, band not — the fineprint table still tells the
    // user roughly where they'll land; flag it here without inflating
    // the total.
    rows.push({
      label: "Council tax",
      monthlyText: "—",
      sub: `${fineprint.councilTax.authority} (band unknown)`,
      informational: true,
    });
    totalHasUnknowns = true;
  }

  // Service charge / ground rent — flat conversion ÷ 12. Both are
  // optional leasehold-only fields and frequently absent.
  if (fineprint.serviceChargeAnnual !== null) {
    const monthly = Math.round(fineprint.serviceChargeAnnual / 12);
    rows.push({
      label: "Service charge",
      monthlyText: formatMoney(monthly),
      sub: `${formatMoney(fineprint.serviceChargeAnnual)}/yr`,
    });
    monthlyTotal += monthly;
  }
  if (fineprint.groundRentAnnual !== null) {
    const monthly = Math.round(fineprint.groundRentAnnual / 12);
    rows.push({
      label: "Ground rent",
      monthlyText: formatMoney(monthly),
      sub: `${formatMoney(fineprint.groundRentAnnual)}/yr`,
    });
    monthlyTotal += monthly;
  }

  // Deposit — amortised over the minimum term. Both inputs need to
  // be present; without the term we don't know what to divide by.
  if (
    fineprint.deposit !== null &&
    fineprint.minimumTermMonths !== null &&
    fineprint.minimumTermMonths > 0
  ) {
    const monthly = Math.round(fineprint.deposit / fineprint.minimumTermMonths);
    rows.push({
      label: "Deposit",
      monthlyText: formatMoney(monthly),
      sub: `${formatMoney(fineprint.deposit)} over ${fineprint.minimumTermMonths} months`,
    });
    monthlyTotal += monthly;
  } else if (fineprint.deposit !== null) {
    rows.push({
      label: "Deposit",
      monthlyText: formatMoney(fineprint.deposit),
      sub: "one-off",
      informational: true,
    });
  }

  // Bills — indicator only, never added to the total. Phrasing flips
  // based on whether they're included (positive) or not (default).
  if (fineprint.billsIncluded === true) {
    rows.push({
      label: "Bills",
      monthlyText: "Included",
      informational: true,
    });
  } else if (fineprint.billsIncluded === false) {
    rows.push({
      label: "Bills",
      monthlyText: "Extra",
      sub: "estimate yourself — varies by usage",
      informational: true,
    });
    totalHasUnknowns = true;
  }

  return { rows, monthlyTotal, totalHasUnknowns };
}

function CostsBody({
  data,
  administrationFeesText,
}: {
  data: Computed;
  administrationFeesText?: string | null;
}) {
  const { rows, monthlyTotal, totalHasUnknowns } = data;
  return (
    <>
      <ul className="flex flex-col">
        {rows.map((row, idx) => (
          <li
            className={`flex items-center py-3 ${idx < rows.length - 1 ? "border-border border-b" : ""}`}
            key={row.label}
          >
            <div className="flex grow basis-0 flex-col">
              <span className="font-medium text-[14px] text-foreground leading-[120%]">
                {row.label}
              </span>
              {row.sub ? (
                <span className="mt-0.5 text-[11px] text-muted-foreground leading-[110%]">
                  {row.sub}
                </span>
              ) : null}
            </div>
            <span
              className={`font-medium font-serif text-[17px] tabular-nums leading-[110%] ${
                row.informational ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {row.monthlyText}
            </span>
          </li>
        ))}
      </ul>

      {monthlyTotal > 0 ? (
        <div className="flex items-baseline justify-between rounded-xl bg-muted px-4 py-3.5">
          <div className="flex flex-col">
            <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              True monthly{totalHasUnknowns ? " (partial)" : ""}
            </span>
            {totalHasUnknowns ? (
              <span className="mt-0.5 text-[11px] text-muted-foreground leading-[110%]">
                excludes items marked above
              </span>
            ) : null}
          </div>
          <span className='font-medium font-serif text-[26px] text-foreground tabular-nums leading-[110%]'>
            {formatMoney(monthlyTotal)}
          </span>
        </div>
      ) : null}

      {administrationFeesText ? (
        <p className="text-[11px] text-muted-foreground leading-[140%]">
          <span className="font-semibold uppercase tracking-[0.12em]">
            Admin fees disclosure
          </span>
          <span className="mt-0.5 block">{administrationFeesText}</span>
        </p>
      ) : null}
    </>
  );
}

/** Mobile-shell variant: bare section, no card chrome. */
export function Costs(props: Props) {
  const data = computeCosts(props);
  if (data.rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          What you'll pay
        </span>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          Costs
        </h2>
      </header>
      <CostsBody
        administrationFeesText={props.fineprint.administrationFeesText}
        data={data}
      />
    </section>
  );
}

/** Desktop InfoColumn variant: bordered card to match `<AiCard>` etc. */
export function CostsCard(props: Props) {
  const data = computeCosts(props);
  if (data.rows.length === 0) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <header className="flex flex-col gap-1">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          What you'll pay
        </span>
        <h2 className="font-serif text-[22px] text-foreground">Costs</h2>
      </header>
      <CostsBody
        administrationFeesText={props.fineprint.administrationFeesText}
        data={data}
      />
    </article>
  );
}

/**
 * Pick the monthly amount that applies to the listing's specific band.
 * Returns `null` when the band is unknown — the caller renders the
 * authority-known-but-band-unknown row instead.
 */
function pickCouncilTaxMonthly(
  ct: ListingDetailCouncilTax | null
): number | null {
  if (!ct?.listingBand) {
    return null;
  }
  const row = ct.bands.find((b) => b.band === ct.listingBand);
  return row ? row.monthlyPounds : null;
}

function councilTaxSub(ct: ListingDetailCouncilTax | null): string | undefined {
  if (!ct?.listingBand) {
    return;
  }
  return `${ct.authority} · Band ${ct.listingBand}`;
}

function formatMoney(value: number): string {
  return `£${value.toLocaleString("en-GB")}`;
}
