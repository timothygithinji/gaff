/**
 * Desktop Shortlist workspace (Paper "Shortlist · Desktop" 37K-0, laptop
 * 4H0-0, tablet 4GZ-0), shown at `lg`+ inside the shared top-nav shell.
 *
 *   - HEADER : eyebrow "You & <Other> · N shortlisted" + page title +
 *              a square-chip tab strip (Pipeline · Mutual · Yours ·
 *              <members>).
 *   - BODY   : the Pipeline tab feeds the kanban through `bodySlot`. The
 *              non-pipeline tabs (Mutual / Yours / per-member) list
 *              not-yet-mutual picks as a card grid with a featured lead.
 *
 * Page sits on the mist ground; the kanban + cards carry the surface.
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { MutualMatch } from "../../server/functions/shortlist";
import { AdminSidebar } from "../layout/admin-sidebar";
import {
  SortDropdown,
  type SortKey,
} from "./sort-dropdown";
import { type ShortlistTab, ShortlistTabs } from "./tabs";

type Props = {
  partnerLabel: string | null;
  /** Total clusters in the pipeline — drives the header eyebrow count. */
  shortlistedCount: number;
  sectionLabel: string;
  tabs: ShortlistTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  featured?: MutualMatch | null;
  featuredAgeLabel?: string;
  rows: MutualMatch[];
  rowAgeLabel: (m: MutualMatch) => string;
  memberCount: number;
  onOpen: (clusterId: string) => void;
  onPlanViewing: (match: MutualMatch) => void;
  /** Pipeline kanban — replaces the featured + grid body when present. */
  bodySlot?: ReactNode;
};

export function DesktopShortlist({
  partnerLabel,
  shortlistedCount,
  sectionLabel,
  tabs,
  activeTab,
  onTabChange,
  sortKey,
  onSortChange,
  featured,
  featuredAgeLabel,
  rows,
  rowAgeLabel,
  memberCount,
  onOpen,
  onPlanViewing,
  bodySlot,
}: Props) {
  const eyebrow = partnerLabel
    ? `You & ${partnerLabel} · ${shortlistedCount} shortlisted`
    : `${shortlistedCount} shortlisted`;
  return (
    <AdminSidebar mode="desktop-only">
      <header className="flex items-end justify-between gap-4 px-10 pt-7 pb-4.5">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[11px] text-slate uppercase leading-[14px] tracking-[0.14em]">
            {eyebrow}
          </span>
          <h1 className="font-semibold text-[36px] text-navy leading-[44px] tracking-[-0.025em]">
            Shortlist
          </h1>
        </div>
        {tabs.length > 0 ? (
          <ShortlistTabs
            activeId={activeTab}
            hideCountFor={["pipeline"]}
            onChange={onTabChange}
            tabs={tabs}
            variant="square"
          />
        ) : null}
      </header>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col px-10 pt-2",
          // The kanban manages its own bounded-height scroll; the card-grid
          // view keeps the page's natural vertical scroll.
          bodySlot ? "min-h-0 overflow-hidden pb-6" : "pb-10"
        )}
      >
        {bodySlot ? (
          bodySlot
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <SectionHead label={sectionLabel} rowCount={rows.length} />
              <SortDropdown onChange={onSortChange} value={sortKey} />
            </div>
            {featured ? (
              <FeaturedBanner
                ageLabel={featuredAgeLabel ?? ""}
                match={featured}
                memberCount={memberCount}
                onOpen={() => onOpen(featured.clusterId)}
                onPlanViewing={() => onPlanViewing(featured)}
              />
            ) : null}
            <CardGrid
              memberCount={memberCount}
              onOpen={onOpen}
              rowAgeLabel={rowAgeLabel}
              rows={rows}
            />
          </div>
        )}
      </div>
    </AdminSidebar>
  );
}

function SectionHead({
  label,
  rowCount,
}: {
  label: string;
  rowCount: number;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <h2 className="font-semibold text-[18px] text-navy tracking-[-0.01em]">
        {label}
      </h2>
      <span className="text-[12px] text-slate">
        {rowCount} {rowCount === 1 ? "match" : "matches"}
      </span>
    </div>
  );
}

function FeaturedBanner({
  match,
  ageLabel,
  memberCount,
  onOpen,
  onPlanViewing,
}: {
  match: MutualMatch;
  ageLabel: string;
  memberCount: number;
  onOpen: () => void;
  onPlanViewing: () => void;
}) {
  const { headline } = match;
  const title = shortAddressTitle(headline.addressRaw);
  return (
    <article className="relative flex h-[260px] overflow-hidden rounded-2xl bg-[#0e2235]">
      <button
        aria-label={`Open ${title}`}
        className="relative h-full w-[56%] overflow-hidden bg-mist text-left"
        onClick={onOpen}
        type="button"
      >
        {headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js.
          <img
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            src={headline.photoUrl}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0e2235]" />
        {memberCount > 1 ? (
          <span className="absolute top-5 left-5 inline-flex items-center gap-2 rounded-full bg-[#0e2235]/75 px-3 py-1.5">
            <span className="flex">
              {match.members.slice(0, 4).map((m, idx) => (
                <span
                  className={cn(
                    "-ml-1.5 flex size-[18px] items-center justify-center rounded-full border-2 border-[#0e2235] font-semibold text-[9px] text-white first:ml-0",
                    idx % 2 === 0 ? "bg-[#1f3a5f]" : "bg-[#d77a4a]"
                  )}
                  key={m.userId}
                >
                  {m.emailInitial}
                </span>
              ))}
            </span>
            <span className='font-semibold text-[#eef1f4] text-[11px] uppercase tracking-wider'>
              {memberCount === 2 ? "Both kept" : `All ${memberCount} kept`} ·{" "}
              {ageLabel}
            </span>
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col justify-between p-7">
        <div className="flex flex-col gap-1.5">
          <h2 className='font-semibold text-[#eef1f4] text-[28px] leading-[32px] tracking-[-0.02em]'>
            {title}
          </h2>
          <p className="text-[13px] text-white/65">
            {locationLine(headline.postcode, headline.bedrooms, headline.bathrooms)}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className='font-semibold text-[#eef1f4] text-[30px] leading-none tracking-[-0.02em]'>
              {formatPrice(headline.priceMonthly)}
            </span>
            <span className="text-[12px] text-white/55">
              /mo · {portalLabel(headline.portal)}
            </span>
          </div>
        </div>
        <button
          className="flex w-fit items-center justify-center rounded-full bg-[#d77a4a] px-5 py-3 font-semibold text-[13px] text-white"
          onClick={onPlanViewing}
          type="button"
        >
          Plan a viewing
        </button>
      </div>
    </article>
  );
}

function CardGrid({
  rows,
  rowAgeLabel,
  memberCount,
  onOpen,
}: {
  rows: MutualMatch[];
  rowAgeLabel: (m: MutualMatch) => string;
  memberCount: number;
  onOpen: (clusterId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-card p-10 text-center text-slate text-sm">
        Nothing here yet. Keep swiping on the Review screen — picks land here as
        you (and your household) hit Keep.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
      {rows.map((m) => (
        <PickCard
          ageLabel={rowAgeLabel(m)}
          isMutual={memberCount > 1 && m.members.length === memberCount}
          key={`${m.clusterId}:${m.searchId}`}
          match={m}
          memberCount={memberCount}
          onOpen={() => onOpen(m.clusterId)}
        />
      ))}
    </div>
  );
}

function PickCard({
  match,
  isMutual,
  ageLabel,
  memberCount,
  onOpen,
}: {
  match: MutualMatch;
  isMutual: boolean;
  ageLabel: string;
  memberCount: number;
  onOpen: () => void;
}) {
  const { headline } = match;
  const title = shortAddressTitle(headline.addressRaw);
  const keptLabel = memberCount === 2 ? "Both kept" : `All ${memberCount} kept`;
  return (
    <button
      className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card text-left"
      onClick={onOpen}
      type="button"
    >
      <div className="relative h-[160px] w-full overflow-hidden bg-mist">
        {headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js.
          <img
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            src={headline.photoUrl}
          />
        ) : null}
        {isMutual ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[#0e2235]/75 px-2 py-1">
            <span className="flex">
              {match.members.slice(0, 4).map((m, idx) => (
                <span
                  className={cn(
                    '-ml-1.5 flex size-3.5 items-center justify-center rounded-full border-[#0e2235] border-[1.5px] font-semibold text-[7px] text-white first:ml-0',
                    idx % 2 === 0 ? "bg-[#1f3a5f]" : "bg-[#d77a4a]"
                  )}
                  key={m.userId}
                >
                  {m.emailInitial}
                </span>
              ))}
            </span>
            <span className="font-semibold text-[10px] text-white">
              {keptLabel}
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-[15px] text-navy">
            {title}
          </span>
          <span className="shrink-0 font-semibold text-[15px] text-navy">
            {formatPrice(headline.priceMonthly)}
          </span>
        </div>
        <span className="text-[11px] text-slate">
          {locationLine(headline.postcode, headline.bedrooms, headline.bathrooms)}
        </span>
        {isMutual ? (
          <span className="text-[11px] text-success">
            ✓ {keptLabel} · {ageLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `£${value.toLocaleString("en-GB")}`;
}

function shortAddressTitle(addressRaw: string): string {
  const idx = addressRaw.indexOf(",");
  const firstLine = idx === -1 ? addressRaw : addressRaw.slice(0, idx);
  return stripLeadingHouseNumber(firstLine.trim());
}

/**
 * Street name only ("22 Belsize Park Mews" → "Belsize Park Mews"), matching
 * Paper. Leaves named buildings intact.
 */
function stripLeadingHouseNumber(line: string): string {
  const stripped = line.replace(/^(flat|unit|apartment|apt)\s+\w+\s+/i, "");
  const withoutNumber = stripped.replace(/^\d+[a-z]?\s+/i, "");
  return withoutNumber.length > 0 ? withoutNumber : line;
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

function locationLine(
  postcode: string | null,
  beds: number | null,
  baths: number | null
): string {
  const parts: string[] = [];
  if (postcode) {
    parts.push(postcode.split(" ")[0] ?? postcode);
  }
  if (beds !== null) {
    parts.push(`${beds} bed`);
  }
  if (baths !== null) {
    parts.push(`${baths} bath`);
  }
  return parts.join(" · ");
}
