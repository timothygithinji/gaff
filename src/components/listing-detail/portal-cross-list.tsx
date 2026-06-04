/**
 * "Same property · N portals" card — surfaces the per-portal price spread
 * for the cluster. The first row is the cheapest (no delta); subsequent
 * rows show the +£N delta in copper to flag the friction of paying more.
 *
 * Paper (mobile 2T3-0 "Same property · 98% match"): slate eyebrow, white
 * card (radius 6, hairline, 16px padding), each row a 28px navy circle
 * portal badge + name + slate-2 sub + right-aligned price; the cheapest
 * row carries a small-caps copper "CHEAPEST" tag.
 */
import type { ListingDetailPortalRow } from "../../server/functions/listing-detail";
import { SectionLabel } from "./section-label";

type Props = {
  portals: ListingDetailPortalRow[];
};

function portalInitial(portal: string): string {
  if (portal === "rightmove") {
    return "R";
  }
  if (portal === "zoopla") {
    return "Z";
  }
  if (portal === "openrent") {
    return "O";
  }
  return portal.charAt(0).toUpperCase();
}

function portalLabel(portal: string): string {
  if (portal === "rightmove") {
    return "Rightmove";
  }
  if (portal === "zoopla") {
    return "Zoopla";
  }
  if (portal === "openrent") {
    return "OpenRent";
  }
  return portal;
}

/** Per-portal badge tint, mirroring Paper (navy / slate / slate-2). */
function badgeColour(portal: string): string {
  if (portal === "rightmove") {
    return "bg-slate";
  }
  if (portal === "zoopla") {
    return "bg-slate-2";
  }
  return "bg-primary";
}

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function formatDelta(delta: number | null): string | null {
  if (delta === null || delta === 0) {
    return null;
  }
  const sign = delta > 0 ? "+" : "−";
  return `${sign}£${Math.abs(delta).toLocaleString("en-GB")}`;
}

function agentSubtitle(row: ListingDetailPortalRow): string {
  if (row.portal === "openrent") {
    return row.agentName ?? "Direct · no fees";
  }
  if (row.agentName) {
    return row.agentName;
  }
  return "Listing agent details pending";
}

/** Hard-coded at 100% — clustering matched the property or it didn't. */
const MATCH_LABEL = "100% match";

export function PortalCrossList({ portals }: Props) {
  if (portals.length < 2) {
    // Only one portal — the cross-list card disappears; the header row on
    // the page already says "N portals tracking" so there's no gap.
    return null;
  }

  // Only call out a "cheapest" when there's a real spread — i.e. some
  // portal is strictly dearer than the headline. If every portal lists the
  // same rent there's no cheapest to crown, so the tag is suppressed.
  const headlinePrice = portals[0]?.priceMonthly ?? null;
  const hasSpread =
    headlinePrice !== null &&
    portals.some(
      (p) => p.priceMonthly !== null && p.priceMonthly > headlinePrice
    );

  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>
        Same property · {MATCH_LABEL.replace(" match", "")} match
      </SectionLabel>

      <div className="flex flex-col gap-3.5 rounded-md border border-line bg-card p-4">
        {portals.map((row, idx) => (
          <PortalRow
            isHeadline={idx === 0}
            key={`${row.portal}:${row.url}`}
            row={row}
            showCheapest={hasSpread}
          />
        ))}
      </div>
    </section>
  );
}

function DeltaTag({
  isHeadline,
  delta,
  deltaPositive,
  showCheapest,
}: {
  isHeadline: boolean;
  delta: string | null;
  deltaPositive: boolean;
  showCheapest: boolean;
}) {
  if (isHeadline) {
    if (!showCheapest) {
      return null;
    }
    return (
      <span className="font-semibold text-[9px] text-copper uppercase leading-3 tracking-[0.1em]">
        Cheapest
      </span>
    );
  }
  if (!delta) {
    return null;
  }
  return (
    <span
      className={`font-semibold text-[10px] leading-3 ${
        deltaPositive ? "text-copper" : "text-success"
      }`}
    >
      {delta}
    </span>
  );
}

function PortalRow({
  row,
  isHeadline,
  showCheapest,
}: {
  row: ListingDetailPortalRow;
  isHeadline: boolean;
  showCheapest: boolean;
}) {
  const delta = isHeadline ? null : formatDelta(row.deltaFromHeadline);
  const dim = !(row.agentName || row.agentEmail);
  const deltaPositive = (row.deltaFromHeadline ?? 0) > 0;
  return (
    <a
      className={`flex items-center gap-3 ${dim && !isHeadline ? "opacity-70" : ""}`}
      href={row.url}
      rel="noreferrer"
      target="_blank"
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full ${badgeColour(row.portal)}`}
      >
        <span className='font-semibold text-[#eef1f4] text-[12px]'>
          {portalInitial(row.portal)}
        </span>
      </span>
      <div className="flex grow basis-0 flex-col gap-0.5">
        <p className="font-medium text-[13px] text-foreground leading-4">
          {portalLabel(row.portal)}
        </p>
        <p className="text-[11px] text-slate-2 leading-[14px]">
          {agentSubtitle(row)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-semibold text-[15px] text-foreground leading-5">
          {formatPrice(row.priceMonthly)}
        </span>
        <DeltaTag
          delta={delta}
          deltaPositive={deltaPositive}
          isHeadline={isHeadline}
          showCheapest={showCheapest}
        />
      </div>
    </a>
  );
}
