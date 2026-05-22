/**
 * "Public records" — the 5-row data grid showing EPC, broadband,
 * crime, flood, amenities. Each row has an icon, label, and right-
 * aligned headline + secondary sub.
 *
 * Missing-data handling:
 *   - EPC: "EPC pending" + null sub when the enrichment hasn't run.
 *   - Broadband: "Pending" headline; AI extraction populates over
 *     time.
 *   - Crime: postcodes.io always gives us the area label when the
 *     postcode resolves; the rate is "See police.uk" until a future
 *     PR wires police.uk numbers.
 *   - Flood + Within 500m: hard-coded "Pending" placeholders. These
 *     need their own external clients (EA Flood, OS amenities) which
 *     are punted to v1.1.
 */
import {
  CloudIcon,
  FlashIcon,
  MapPinIcon,
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
      headline: "EPC pending",
      sub: null,
    };
  }
  const headline = epc.rating;
  const sub = epc.potential ? `Potential ${epc.potential}` : null;
  return {
    icon: FlashIcon,
    label: "EPC rating",
    headline,
    sub,
  };
}

function broadbandRow(broadband?: string): Row {
  return {
    icon: Wifi01Icon,
    label: "Broadband",
    headline: broadband ?? "Pending",
    sub: broadband ? null : "AI extraction not yet run",
  };
}

function crimeRow(crime?: ListingDetailPublicRecords["crime"]): Row {
  if (!crime) {
    return {
      icon: Shield01Icon,
      label: "Crime · last 12mo",
      headline: "Pending",
      sub: null,
    };
  }
  return {
    icon: Shield01Icon,
    label: "Crime · last 12mo",
    headline: crime.rateLabel,
    sub: crime.area,
  };
}

function floodRow(floodRisk?: string): Row {
  return {
    icon: CloudIcon,
    label: "Flood risk",
    headline: floodRisk ?? "Pending",
    sub: floodRisk ? null : "EA Flood API not yet wired",
  };
}

function withinRow(within?: ListingDetailPublicRecords["within500m"]): Row {
  if (!within) {
    return {
      icon: MapPinIcon,
      label: "Within 500m",
      headline: "Pending",
      sub: null,
    };
  }
  const parts: string[] = [];
  if (within.parks) {
    parts.push(`${within.parks} park${within.parks === 1 ? "" : "s"}`);
  }
  if (within.cafes) {
    parts.push(`${within.cafes} café${within.cafes === 1 ? "" : "s"}`);
  }
  if (within.pubs) {
    parts.push(`${within.pubs} pub${within.pubs === 1 ? "" : "s"}`);
  }
  const sub = within.gp ? `Plus ${within.gp} GP nearby` : null;
  return {
    icon: MapPinIcon,
    label: "Within 500m",
    headline: parts.join(" · ") || "—",
    sub,
  };
}

export function PublicRecords({ epc, publicRecords }: Props) {
  const rows: Row[] = [
    epcRow(epc),
    broadbandRow(publicRecords?.broadband),
    crimeRow(publicRecords?.crime),
    floodRow(publicRecords?.floodRisk),
    withinRow(publicRecords?.within500m),
  ];

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
