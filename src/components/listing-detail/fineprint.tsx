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
 *   - Agent name / phone / branch
 *   - Fees disclosure (Tenant Fees Act 2019)
 *
 * Everything renders as a definition list; rows with no value are
 * skipped so we don't paint a column of "—".
 */
import {
  Calendar03Icon,
  ContactIcon,
  FileEditIcon,
  PoundCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ListingDetailFineprint } from "../../server/functions/listing-detail";

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
  push("Council tax band", fp.councilTaxBand);
  if (fp.councilTaxAnnualEstimate !== null) {
    // Derived from the billing authority's Band D via statutory ratios —
    // an area approximation, so it's labelled as such.
    push(
      "Council tax/yr",
      `~£${fp.councilTaxAnnualEstimate.toLocaleString("en-GB")}`
    );
  }
  if (fp.billsIncluded !== null) {
    push("Bills included", fp.billsIncluded ? "Yes" : "No");
  }
  push("Service charge", formatPounds(fp.serviceChargeAnnual));
  push("Ground rent", formatPounds(fp.groundRentAnnual));
  return rows;
}

export function Fineprint({ fineprint }: Props) {
  const rows = buildRows(fineprint);
  const hasAnything =
    rows.length > 0 || fineprint.agentName || fineprint.feesText;
  if (!hasAnything) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            className="text-muted-foreground"
            icon={FileEditIcon}
            size={12}
            strokeWidth={2}
          />
          <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Tenancy terms
          </span>
        </div>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          Fine print
        </h2>
      </header>

      {rows.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-muted/40 p-4">
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

      {fineprint.agentName ? (
        <div className="flex flex-col gap-1 rounded-2xl bg-muted/40 p-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              className="text-muted-foreground"
              icon={ContactIcon}
              size={14}
              strokeWidth={1.8}
            />
            <span className="font-medium text-[14px] text-foreground">
              {fineprint.agentName}
            </span>
          </div>
          {fineprint.agentPhone ? (
            <a
              className="text-[13px] text-muted-foreground hover:text-foreground"
              href={`tel:${fineprint.agentPhone}`}
            >
              {fineprint.agentPhone}
            </a>
          ) : null}
        </div>
      ) : null}

      {fineprint.feesText ? (
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-card p-4">
          <HugeiconsIcon
            className="mt-0.5 shrink-0 text-muted-foreground"
            icon={PoundCircleIcon}
            size={14}
            strokeWidth={1.8}
          />
          <p className="text-[12px] text-muted-foreground leading-[145%]">
            {fineprint.feesText}
          </p>
        </div>
      ) : null}

      {fineprint.nearestStations.length > 0 ? (
        <div className="rounded-2xl bg-muted/40 p-4">
          <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            <HugeiconsIcon
              className="-mt-0.5 inline text-muted-foreground"
              icon={Calendar03Icon}
              size={12}
              strokeWidth={2}
            />
            <span className="ml-1">Nearest stations</span>
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {fineprint.nearestStations.slice(0, 4).map((s) => {
              const dist = s.distanceMiles ?? null;
              const walkMin =
                dist !== null ? Math.max(1, Math.round(dist * 20)) : null;
              return (
                <li
                  className="flex items-center justify-between text-[13px]"
                  key={s.name}
                >
                  <span className="text-foreground">{s.name}</span>
                  <span className="text-muted-foreground">
                    {dist !== null ? `${dist.toFixed(1)} mi` : "—"}
                    {walkMin !== null ? ` · ${walkMin}-min walk` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
