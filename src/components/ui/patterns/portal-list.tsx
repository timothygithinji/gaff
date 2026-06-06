import { cn } from "@/lib/utils";
/**
 * Per-portal price spread, shared by listing detail (and later the review
 * hero). Owns the delta / cheapest / "has spread" logic and the
 * portal label + badge helpers that were duplicated between
 * portal-cross-list.tsx and desktop-listing-detail's PortalRow.
 *
 * Two presentations over one `toPortalRows` shaper:
 *   - `variant="card"` — 28px initial badge + name/agent + right price (Paper
 *     mobile "Same property" card).
 *   - `variant="rail"` — brand `PortalLogo` + name·agent, price indented
 *     below with a hover open-link affordance (desktop price card).
 */
import { LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PortalLogo } from "../../portal-logo";
import { formatPrice } from "./price-block";

export type PortalRowItem = {
  portal: string;
  url: string;
  priceMonthly: number | null;
  agentName: string | null;
  agentEmail: string | null;
  deltaFromHeadline: number | null;
  isHeadline: boolean;
};

type PortalSource = {
  portal: string;
  url: string;
  priceMonthly: number | null;
  agentName: string | null;
  agentEmail: string | null;
  deltaFromHeadline: number | null;
};

/**
 * Normalise a portal spread (headline first) into rows + whether any portal
 * is strictly dearer than the headline — the only case where a "cheapest"
 * call-out is meaningful. Pure; exported for contract tests.
 */
export function toPortalRows(spread: PortalSource[]): {
  rows: PortalRowItem[];
  hasSpread: boolean;
} {
  const headlinePrice = spread[0]?.priceMonthly ?? null;
  const hasSpread =
    headlinePrice !== null &&
    spread.some((p) => p.priceMonthly !== null && p.priceMonthly > headlinePrice);
  const rows = spread.map((p, idx) => ({ ...p, isHeadline: idx === 0 }));
  return { rows, hasSpread };
}

export function portalLabel(portal: string): string {
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

function portalInitial(portal: string): string {
  return portalLabel(portal).charAt(0).toUpperCase();
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

function formatDelta(delta: number | null): string | null {
  if (delta === null || delta === 0) {
    return null;
  }
  const sign = delta > 0 ? "+" : "−";
  return `${sign}£${Math.abs(delta).toLocaleString("en-GB")}`;
}

function agentSubtitle(row: PortalRowItem): string {
  if (row.portal === "openrent") {
    return row.agentName ?? "Direct · no fees";
  }
  return row.agentName ?? "Listing agent details pending";
}

export function PortalList({
  rows,
  hasSpread,
  variant,
  className,
}: {
  rows: PortalRowItem[];
  hasSpread: boolean;
  variant: "card" | "rail";
  className?: string;
}) {
  if (variant === "rail") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {rows.map((row) => (
          <RailRow
            key={`${row.portal}:${row.url}`}
            row={row}
            showCheapest={hasSpread && row.isHeadline}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-md border border-line bg-card p-4",
        className
      )}
    >
      {rows.map((row) => (
        <CardRow
          key={`${row.portal}:${row.url}`}
          row={row}
          showCheapest={hasSpread}
        />
      ))}
    </div>
  );
}

function DeltaTag({
  row,
  showCheapest,
}: {
  row: PortalRowItem;
  showCheapest: boolean;
}) {
  if (row.isHeadline) {
    if (!showCheapest) {
      return null;
    }
    return (
      <span className="font-semibold text-[9px] text-copper uppercase leading-3 tracking-[0.1em]">
        Cheapest
      </span>
    );
  }
  const delta = formatDelta(row.deltaFromHeadline);
  if (!delta) {
    return null;
  }
  const positive = (row.deltaFromHeadline ?? 0) > 0;
  return (
    <span
      className={cn(
        "font-semibold text-[10px] leading-3",
        positive ? "text-copper" : "text-success"
      )}
    >
      {delta}
    </span>
  );
}

function CardRow({
  row,
  showCheapest,
}: {
  row: PortalRowItem;
  showCheapest: boolean;
}) {
  const dim = !(row.agentName || row.agentEmail) && !row.isHeadline;
  return (
    <a
      className={cn("flex items-center gap-3", dim && "opacity-70")}
      href={row.url}
      rel="noreferrer"
      target="_blank"
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          badgeColour(row.portal)
        )}
      >
        <span className="font-semibold text-[#eef1f4] text-[12px]">
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
        <DeltaTag row={row} showCheapest={showCheapest} />
      </div>
    </a>
  );
}

function RailRow({
  row,
  showCheapest,
}: {
  row: PortalRowItem;
  showCheapest: boolean;
}) {
  const delta = row.deltaFromHeadline ?? 0;
  return (
    <a
      className="group -mx-2 flex flex-col gap-1 rounded-md px-2 py-2 transition-colors hover:bg-ground"
      href={row.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="flex items-center gap-2.5">
        <PortalLogo portal={row.portal} />
        <span className="min-w-0 flex-1 text-[13px] text-foreground">
          {portalLabel(row.portal)}
          {row.agentName ? ` · ${row.agentName}` : " · direct"}
        </span>
        <HugeiconsIcon
          className="shrink-0 text-slate opacity-0 transition-opacity group-hover:opacity-100"
          icon={LinkSquare01Icon}
          size={13}
          strokeWidth={1.6}
        />
      </div>
      {/* Price indented to line up with the name past the badge. */}
      <div className="flex items-baseline gap-1.5 pl-[34px]">
        {showCheapest ? (
          <>
            <span className="font-semibold text-[13px] text-foreground">
              {formatPrice(row.priceMonthly)}
            </span>
            <span className="font-bold text-[9px] text-copper uppercase tracking-[0.08em]">
              Cheapest
            </span>
          </>
        ) : (
          <span className="text-[13px] text-slate">
            {formatPrice(row.priceMonthly)}
            {delta > 0 ? ` +${formatPrice(delta)}` : ""}
          </span>
        )}
      </div>
    </a>
  );
}
