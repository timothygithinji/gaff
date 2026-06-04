/**
 * "Public records" — the data grid showing EPC, broadband,
 * amenities, and flood risk.
 *
 * v2: every row sources from a typed enrichment column. If an enrichment
 * hasn't run yet, the row renders as "Pending". Hidden entirely when
 * there's no data of any kind.
 *
 * Paper (mobile 2T3-0 "Public records"): slate eyebrow, a single white
 * card (radius 6, hairline) of rows divided by #eef1f4, each row a slate-2
 * outline icon + 13px label on the left and a right-aligned 14px/600
 * headline + 10px slate-2 sub.
 */
import {
  FlashIcon,
  Location01Icon,
  TsunamiIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  ListingDetailEpc,
  ListingDetailPublicRecords,
} from "../../server/functions/listing-detail";
import { SectionLabel } from "./section-label";

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
  /** Sub-line tone — defaults to muted; rows may use a signed tone. */
  subTone?: "muted" | "success" | "warning";
};

function epcRow(epc: ListingDetailEpc | undefined): Row {
  // Only building-specific bands are shown (portal-published or an exact
  // register match). When we have neither it's "Unknown" — we don't fall
  // back to a postcode-level estimate.
  if (!epc) {
    return {
      icon: FlashIcon,
      label: "EPC rating",
      headline: "Unknown",
      sub: null,
    };
  }
  if (epc.source === "portal") {
    return {
      icon: FlashIcon,
      label: "EPC rating",
      headline: epc.rating,
      sub: "As published on the listing",
    };
  }
  return {
    icon: FlashIcon,
    label: "EPC rating",
    headline: epc.rating,
    sub: epc.potential ? `Potential ${epc.potential}` : null,
  };
}

function broadbandRow(broadband: ListingDetailPublicRecords["broadband"]): Row {
  if (!broadband) {
    return {
      icon: Wifi01Icon,
      label: "Broadband",
      headline: "Pending",
      sub: "Enrichment not yet run",
    };
  }
  const speed = broadband.downloadMbps
    ? `${broadband.downloadMbps} Mbps`
    : "Speed pending";
  const tech = broadband.technology ?? "Unknown";
  return {
    icon: Wifi01Icon,
    label: "Broadband",
    headline: `${tech} · ${speed}`,
    sub: broadband.fttpAvailable ? "Gigabit-capable" : null,
  };
}

function amenitiesRow(
  amenities: ListingDetailPublicRecords["amenities"]
): Row | null {
  if (!amenities) {
    return null;
  }
  const total = Object.values(amenities.counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return null;
  }
  const headline = `${total} within ${Math.round(amenities.withinMeters)}m`;
  const top = Object.entries(amenities.counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${humaniseCategory(k)} ${v}`)
    .join(" · ");
  return {
    icon: Location01Icon,
    label: "Within 500m",
    headline,
    sub: top || null,
  };
}

function floodRow(flood: ListingDetailPublicRecords["flood"]): Row | null {
  if (!flood) {
    return null;
  }
  const headline = flood.riskLevel
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return {
    icon: TsunamiIcon,
    label: "Flood risk",
    headline,
    sub: "Environment Agency",
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  cafe: "Cafés",
  restaurant: "Restaurants",
  pub: "Pubs",
  bar: "Bars",
  gym: "Gyms",
  fitness_centre: "Gyms",
  school: "Schools",
  supermarket: "Supermarkets",
  pharmacy: "Pharmacies",
  doctors: "GPs",
  hospital: "Hospitals",
  park: "Parks",
  bus_stop: "Bus stops",
  station: "Stations",
  bicycle_parking: "Bike parking",
};

function humaniseCategory(key: string): string {
  if (CATEGORY_LABELS[key]) {
    return CATEGORY_LABELS[key];
  }
  return key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function subToneClass(tone: Row["subTone"]): string {
  if (tone === "success") {
    return "text-success";
  }
  if (tone === "warning") {
    return "text-warning-text";
  }
  return "text-slate-2";
}

export function PublicRecords({ epc, publicRecords }: Props) {
  const rows: Row[] = [epcRow(epc), broadbandRow(publicRecords?.broadband)];
  const flood = floodRow(publicRecords?.flood);
  if (flood) {
    rows.push(flood);
  }
  const amenities = amenitiesRow(publicRecords?.amenities);
  if (amenities) {
    rows.push(amenities);
  }

  return (
    <section className="flex flex-col gap-3.5 px-5 pb-7">
      <SectionLabel>Public records</SectionLabel>

      <ul className="flex flex-col rounded-md border border-line bg-card px-4">
        {rows.map((row, idx) => (
          <li
            className={`flex items-center justify-between py-3.5 ${idx < rows.length - 1 ? "border-mist border-b" : ""}`}
            key={row.label}
          >
            <div className="flex items-center gap-3">
              <HugeiconsIcon
                className="shrink-0 text-slate-2"
                icon={row.icon}
                size={16}
                strokeWidth={1.5}
              />
              <span className="text-[13px] text-foreground leading-4">
                {row.label}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-semibold text-[14px] text-foreground leading-[18px]">
                {row.headline}
              </span>
              {row.sub ? (
                <span
                  className={`text-[10px] leading-3 ${subToneClass(row.subTone)}`}
                >
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
