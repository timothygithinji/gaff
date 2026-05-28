/**
 * "Public records" — the data grid showing EPC, broadband, crime,
 * amenities, and flood risk.
 *
 * v2: every row now sources from a typed enrichment column, not the
 * legacy AI-extracted broadband string + postcodes.io crime-area
 * fallback. If an enrichment hasn't run yet, the row renders as
 * "Pending".
 *
 * Hidden entirely when there's no data of any kind — refusing to paint
 * a wall of "Pending" placeholders.
 */
import {
  FlashIcon,
  LocationIcon,
  Shield01Icon,
  TsunamiIcon,
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
    sub: broadband.fttpAvailable ? "Full-fibre available" : null,
  };
}

function crimeRow(crime: ListingDetailPublicRecords["crime"]): Row | null {
  if (!crime) {
    return null;
  }
  // Prefer the area-baseline comparison ("12% below London avg") over
  // the top crime category — a comparison gives the user something to
  // act on; the category alone is trivia.
  const sub = crime.comparison
    ? crime.comparison.label
    : crime.topCategory
      ? `${humaniseCategory(crime.topCategory.category)} · ${crime.topCategory.count}`
      : null;
  return {
    icon: Shield01Icon,
    label: `Crime · ${crime.month}`,
    headline: `${crime.total} in 1mi`,
    sub,
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
    icon: LocationIcon,
    label: "Amenities nearby",
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

export function PublicRecords({ epc, publicRecords }: Props) {
  const rows: Row[] = [epcRow(epc), broadbandRow(publicRecords?.broadband)];
  const crime = crimeRow(publicRecords?.crime);
  if (crime) {
    rows.push(crime);
  }
  const amenities = amenitiesRow(publicRecords?.amenities);
  if (amenities) {
    rows.push(amenities);
  }
  const flood = floodRow(publicRecords?.flood);
  if (flood) {
    rows.push(flood);
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
