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
import type { ReactNode } from "react";
import type {
  ListingDetailEpc,
  ListingDetailPublicRecords,
} from "../../server/functions/listing-detail";

type Props = {
  epc?: ListingDetailEpc;
  publicRecords?: ListingDetailPublicRecords;
};

type Row = {
  icon: ReactNode;
  label: string;
  headline: string;
  sub: string | null;
};

function epcRow(epc: ListingDetailEpc | undefined): Row {
  if (!epc) {
    return {
      icon: <LightningIcon />,
      label: "EPC rating",
      headline: "EPC pending",
      sub: null,
    };
  }
  const headline = epc.rating;
  const sub = epc.potential ? `Potential ${epc.potential}` : null;
  return {
    icon: <LightningIcon />,
    label: "EPC rating",
    headline,
    sub,
  };
}

function broadbandRow(broadband?: string): Row {
  return {
    icon: <WifiIcon />,
    label: "Broadband",
    headline: broadband ?? "Pending",
    sub: broadband ? null : "AI extraction not yet run",
  };
}

function crimeRow(crime?: ListingDetailPublicRecords["crime"]): Row {
  if (!crime) {
    return {
      icon: <ShieldIcon />,
      label: "Crime · last 12mo",
      headline: "Pending",
      sub: null,
    };
  }
  return {
    icon: <ShieldIcon />,
    label: "Crime · last 12mo",
    headline: crime.rateLabel,
    sub: crime.area,
  };
}

function floodRow(floodRisk?: string): Row {
  return {
    icon: <CloudIcon />,
    label: "Flood risk",
    headline: floodRisk ?? "Pending",
    sub: floodRisk ? null : "EA Flood API not yet wired",
  };
}

function withinRow(within?: ListingDetailPublicRecords["within500m"]): Row {
  if (!within) {
    return {
      icon: <PinIcon />,
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
    icon: <PinIcon />,
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
        <span className="font-semibold text-[10px] text-brass uppercase tracking-[0.12em]">
          The boring numbers
        </span>
        <h2 className="font-medium font-serif text-[22px] text-ink leading-[130%] tracking-[-0.02em]">
          Public records
        </h2>
      </header>

      <ul className="flex flex-col">
        {rows.map((row, idx) => (
          <li
            className={`flex items-center py-3.5 ${idx < rows.length - 1 ? "border-[#E5DDD0] border-b" : ""}`}
            key={row.label}
          >
            <div className="flex grow basis-0 items-center gap-3">
              {row.icon}
              <span className="font-medium text-[14px] text-ink leading-[120%]">
                {row.label}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-medium font-serif text-[17px] text-ink leading-[110%]">
                {row.headline}
              </span>
              {row.sub ? (
                <span className="mt-0.5 text-[11px] text-brass leading-[110%]">
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

function LightningIcon() {
  return (
    <svg
      className="text-brass"
      fill="none"
      height="16"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <title>EPC rating icon</title>
      <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg
      className="text-brass"
      fill="none"
      height="16"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <title>Broadband icon</title>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      className="text-brass"
      fill="none"
      height="16"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <title>Crime icon</title>
      <path d="M12 22s8-4 8-12V5l-8-3-8 3v5c0 8 8 12 8 12" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      className="text-brass"
      fill="none"
      height="16"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <title>Flood risk icon</title>
      <path d="M21 14a1 1 0 0 1-1 1H6.83a2 2 0 0 0-1.41.59l-2.13 2.12A1 1 0 0 1 2 17V5a1 1 0 0 1 1-1h17a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      className="text-brass"
      fill="none"
      height="16"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <title>Amenities nearby icon</title>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2a8 8 0 0 0-8 8c0 5 8 12 8 12s8-7 8-12a8 8 0 0 0-8-8" />
    </svg>
  );
}
