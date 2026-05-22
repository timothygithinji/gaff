/**
 * "Same property · N portals" card — surfaces the per-portal price
 * spread for the cluster. The first row is the cheapest (no delta);
 * every subsequent row shows the +£N delta in copper/red to communicate
 * that paying more on a different portal is friction worth flagging.
 *
 * Rows are dimmed when the portal didn't capture an agent name/email
 * (i.e. the spec's "headline portal has agent info but others don't"
 * edge case).
 */
import type { ListingDetailPortalRow } from "../../server/functions/listing-detail";

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
    return row.agentName ?? "Direct from landlord · no fees";
  }
  if (row.agentName) {
    return row.agentName;
  }
  return "Listing agent details pending";
}

/**
 * Match percentage is currently hard-coded at 100% — clustering
 * either matched the property or it didn't, we don't surface a
 * confidence score. The label stays so the design stays intact;
 * v1.1 can wire a real similarity score.
 */
const MATCH_LABEL = "100% match";

export function PortalCrossList({ portals }: Props) {
  if (portals.length < 2) {
    // Only one portal — the cross-list card disappears. The header row
    // on the page already tells the user "N portals tracking" so this
    // doesn't leave a gap.
    return null;
  }

  return (
    <section className="mx-4 mt-5 flex flex-col gap-3.5 rounded-[14px] border border-[#E5DDD0] bg-[#FDFAF4] px-4 py-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-copper">
            ✦
          </span>
          <span className="font-semibold text-[11px] text-ink uppercase tracking-[0.08em]">
            Same property · {portals.length} portals
          </span>
        </div>
        <span className="font-medium text-[11px] text-brass">
          {MATCH_LABEL}
        </span>
      </header>

      <div className="flex flex-col gap-2.5">
        {portals.map((row, idx) => (
          <PortalRow
            isHeadline={idx === 0}
            key={`${row.portal}:${row.url}`}
            row={row}
            showDivider={idx < portals.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function PortalRow({
  row,
  isHeadline,
  showDivider,
}: {
  row: ListingDetailPortalRow;
  isHeadline: boolean;
  showDivider: boolean;
}) {
  const delta = isHeadline ? null : formatDelta(row.deltaFromHeadline);
  const dim = !row.agentName && !row.agentEmail;
  const deltaPositive = (row.deltaFromHeadline ?? 0) > 0;
  return (
    <div className="contents">
      <a
        className={`flex items-center gap-3 ${dim && !isHeadline ? "opacity-70" : ""}`}
        href={row.url}
        rel="noreferrer"
        target="_blank"
      >
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
            isHeadline ? "bg-[#E8D6C9]" : "bg-[#F4E8DE]"
          }`}
        >
          <span
            className={`font-semibold font-serif text-[13px] ${
              isHeadline ? "text-copper" : "text-brass"
            }`}
          >
            {portalInitial(row.portal)}
          </span>
        </div>
        <div className="grow basis-0">
          <p className="font-semibold text-[14px] text-ink leading-[120%]">
            {portalLabel(row.portal)}
          </p>
          <p className="mt-0.5 text-[11px] text-brass leading-[120%]">
            {agentSubtitle(row)}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-medium font-serif text-[18px] text-ink leading-[110%] tracking-[-0.02em]">
            {formatPrice(row.priceMonthly)}
          </span>
          {delta ? (
            <span
              className={`mt-0.5 font-medium text-[10px] leading-[110%] ${
                deltaPositive ? "text-[#8C3A35]" : "text-[#3F5A2E]"
              }`}
            >
              {delta}
            </span>
          ) : null}
        </div>
      </a>
      {showDivider ? <div className="h-px bg-[#F0E8DC]" /> : null}
    </div>
  );
}
