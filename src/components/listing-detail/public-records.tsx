/**
 * "Public records" — the data grid showing EPC, broadband, and crime.
 * Each row has an icon, label, and right-aligned headline + secondary
 * sub.
 *
 * Missing-data handling:
 *   - EPC + Broadband: "Pending" rows when the enrichment hasn't run
 *     yet. Honest placeholder because both WILL be populated by the
 *     enrichment pipeline.
 *   - Crime: postcodes.io always gives us the area label when the
 *     postcode resolves; the rate is "See police.uk" until a future
 *     PR wires police.uk numbers.
 *
 * Flood risk + Within-500m amenities used to live here as static
 * "Pending" rows; they had no external client wired and never
 * populated. Removed until those data sources land — re-add the rows
 * then.
 *
 * If none of the rows have *any* data (no enrichment, no postcode
 * resolved), the whole section is hidden so we don't paint a wall of
 * "Pending" labels.
 */
import {
  FlashIcon,
  Shield01Icon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  ListingDetailEpc,
  ListingDetailPublicRecords,
} from "../../server/functions/listing-detail";

type Props = {
  epc?: ListingDetailEpc;
  publicRecords?: ListingDetailPublicRecords;
};

type IconRef = typeof FlashIcon;

type Row = {
  icon: IconRef;
  label: string;
  headline: string;
  sub: string | null;
};

function epcRow(epc: ListingDetailEpc | undefined): Row {
  if (!epc) {
    return {
      icon: FlashIcon,
      label: "EPC rating",
      headline: "Pending",
      sub: "Enrichment not yet run",
    };
  }
  return {
    icon: FlashIcon,
    label: "EPC rating",
    headline: epc.rating,
    sub: epc.potential ? `Potential ${epc.potential}` : null,
  };
}

function broadbandRow(broadband?: string): Row {
  return {
    icon: Wifi01Icon,
    label: "Broadband",
    headline: broadband ?? "Pending",
    sub: broadband ? null : "Enrichment not yet run",
  };
}

function crimeRow(crime?: ListingDetailPublicRecords["crime"]): Row | null {
  if (!crime) {
    return null;
  }
  return {
    icon: Shield01Icon,
    label: "Crime · last 12mo",
    headline: crime.rateLabel,
    sub: crime.area,
  };
}

export function PublicRecords({ epc, publicRecords }: Props) {
  const rows: Row[] = [epcRow(epc), broadbandRow(publicRecords?.broadband)];
  const crime = crimeRow(publicRecords?.crime);
  if (crime) {
    rows.push(crime);
  }

  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          The boring numbers
        </span>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          Public records
        </h2>
      </header>

      <ul className="flex flex-col">
        {rows.map((row, idx) => (
          <li
            className={`flex items-center py-3.5 ${idx < rows.length - 1 ? "border-border border-b" : ""}`}
            key={row.label}
          >
            <div className="flex grow basis-0 items-center gap-3">
              <HugeiconsIcon
                className="text-muted-foreground"
                icon={row.icon}
                size={16}
                strokeWidth={1.8}
              />
              <span className="font-medium text-[14px] text-foreground leading-[120%]">
                {row.label}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-medium font-serif text-[17px] text-foreground leading-[110%]">
                {row.headline}
              </span>
              {row.sub ? (
                <span className="mt-0.5 text-[11px] text-muted-foreground leading-[110%]">
                  {row.sub}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
