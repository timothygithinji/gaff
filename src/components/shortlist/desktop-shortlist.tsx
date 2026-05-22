/**
 * Desktop Shortlist — full-width workspace shown above the `md`
 * breakpoint:
 *
 *   - HEADER : "You & <Other>" eyebrow + page title + Sort, plus a tab
 *              strip (Mutual · Yours · other members' lists).
 *   - BODY   : cinematic featured banner (photo with gradient overlay +
 *              big address/price + Plan a viewing CTA) followed by a
 *              three-column card grid of mutual picks.
 *
 * The viewing-planner + shared-notes right rail used to live here as
 * static fixtures; both features need a real domain model + product
 * decisions (notes must respect the blind-review timing rule) before
 * they can be re-introduced.
 */
import type { ReactNode } from "react";
import {
  SortDropdown,
  type SortKey,
} from "../../components/shortlist/sort-dropdown";
import {
  type ShortlistTab,
  ShortlistTabs,
} from "../../components/shortlist/tabs";
import { cn } from "../../lib/utils";
import type { MutualMatch } from "../../server/functions/shortlist";
import { AdminSidebar } from "../layout/admin-sidebar";

/* ---------------- Types ---------------- */

type Member = { userId: string; name: string; emailInitial: string };

type Props = {
  // Header
  partnerLabel: string | null;
  /** Section label rendered above the card grid (e.g. "Other mutual picks"). */
  sectionLabel: string;
  // Tabs (omit on solo households)
  tabs: ShortlistTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  // Sort
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  // Featured (only when memberCount > 1 and active tab is Mutual)
  featured?: MutualMatch | null;
  featuredAgeLabel?: string;
  rows: MutualMatch[];
  rowAgeLabel: (m: MutualMatch) => string;
  memberCount: number;
  onOpen: (clusterId: string) => void;
  onPlanViewing: (match: MutualMatch) => void;
};

/* ---------------- Component ---------------- */

export function DesktopShortlist({
  partnerLabel,
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
}: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <Header
        onSortChange={onSortChange}
        partnerLabel={partnerLabel}
        sortKey={sortKey}
      />
      {tabs.length > 0 ? (
        <div className="border-bone border-b px-10 pb-4">
          <ShortlistTabs
            activeId={activeTab}
            onChange={onTabChange}
            tabs={tabs}
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-10 py-7">
        {featured ? (
          <FeaturedBanner
            ageLabel={featuredAgeLabel ?? ""}
            match={featured}
            onOpen={() => onOpen(featured.clusterId)}
            onPlanViewing={() => onPlanViewing(featured)}
          />
        ) : null}
        <SectionHead label={sectionLabel} rowCount={rows.length} />
        <CardGrid
          memberCount={memberCount}
          onOpen={onOpen}
          rowAgeLabel={rowAgeLabel}
          rows={rows}
        />
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Header ---------------- */

function Header({
  partnerLabel,
  sortKey,
  onSortChange,
}: {
  partnerLabel: string | null;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
}) {
  return (
    <header className="flex items-end justify-between px-10 pt-9 pb-4">
      <div className="flex flex-col gap-1">
        {partnerLabel ? (
          <Eyebrow>You & {partnerLabel}</Eyebrow>
        ) : (
          <Eyebrow>Your picks</Eyebrow>
        )}
        <h1 className="font-serif text-[40px] text-foreground leading-[44px] tracking-tight">
          Shortlist
        </h1>
      </div>
      <SortDropdown onChange={onSortChange} value={sortKey} />
    </header>
  );
}

/* ---------------- Featured banner ---------------- */

function FeaturedBanner({
  match,
  ageLabel,
  onOpen,
  onPlanViewing,
}: {
  match: MutualMatch;
  ageLabel: string;
  onOpen: () => void;
  onPlanViewing: () => void;
}) {
  const { headline } = match;
  const title = shortAddressTitle(headline.addressRaw);
  const initials = match.members.map((m) => m.emailInitial.toUpperCase());
  const photo = headline.photoUrl;
  return (
    <article className="relative flex h-[280px] overflow-hidden rounded-2xl bg-foreground">
      <button
        aria-label={`Open ${title}`}
        className="relative h-full w-[56%] overflow-hidden bg-muted text-left"
        onClick={onOpen}
        type="button"
      >
        {photo ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
          <img
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            src={photo}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/0 to-foreground" />
        <div className="absolute top-5 left-5 inline-flex items-center gap-2 rounded-full bg-foreground/75 px-3 py-1.5">
          <AvatarStack initials={initials} />
          <span className="font-semibold text-[11px] text-white uppercase tracking-wider">
            Both kept · {ageLabel}
          </span>
        </div>
        <div className="absolute top-5 right-5 rounded-full bg-[#2E8B57] px-2.5 py-1 font-bold text-[10px] text-white uppercase tracking-wider">
          New mutual
        </div>
      </button>
      <div className="flex flex-1 flex-col justify-between p-7">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-serif text-[30px] text-bone leading-[34px] tracking-tight">
            {title}
          </h2>
          <p className="text-[13px] text-white/65">
            {locationLine(
              headline.postcode,
              headline.bedrooms,
              headline.bathrooms
            )}
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-serif text-[34px] text-bone leading-none">
              {formatPrice(headline.priceMonthly)}
            </span>
            <span className="text-[12px] text-white/55">
              /mo · {portalLabel(headline.portal)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            className="flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-3 font-semibold text-[13px] text-white"
            onClick={onPlanViewing}
            type="button"
          >
            Plan a viewing
          </button>
          <p className="text-[11px] text-white/55">
            Listed via {portalLabel(headline.portal)}
          </p>
        </div>
      </div>
    </article>
  );
}

/* ---------------- Section head + grid ---------------- */

function SectionHead({
  label,
  rowCount,
}: {
  label: string;
  rowCount: number;
}) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-serif text-[22px] text-foreground">{label}</h2>
        <span className="text-muted-foreground text-xs">
          {rowCount} {rowCount === 1 ? "match" : "matches"}
        </span>
      </div>
    </div>
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
      <p className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
        Nothing here yet. Keep swiping on the Review screen — picks land here as
        you (and your household) hit Keep.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((m) => (
        <PickCard
          ageLabel={rowAgeLabel(m)}
          isMutual={memberCount > 1 && m.members.length === memberCount}
          key={`${m.clusterId}:${m.searchId}`}
          match={m}
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
  onOpen,
}: {
  match: MutualMatch;
  isMutual: boolean;
  ageLabel: string;
  onOpen: () => void;
}) {
  const { headline } = match;
  const title = shortAddressTitle(headline.addressRaw);
  const initials = match.members.map((m) => m.emailInitial.toUpperCase());
  return (
    <button
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left"
      onClick={onOpen}
      type="button"
    >
      <div className="relative h-[160px] w-full overflow-hidden bg-muted">
        {headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
          <img
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            src={headline.photoUrl}
          />
        ) : null}
        {isMutual ? (
          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/70 px-2 py-1">
            <AvatarStack initials={initials} small />
            <span className="font-semibold text-[10px] text-white">
              Both kept
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-serif text-[17px] text-foreground">
            {title}
          </span>
          <span className="font-serif text-[17px] text-foreground">
            {formatPrice(headline.priceMonthly)}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {locationLine(
            headline.postcode,
            headline.bedrooms,
            headline.bathrooms
          )}
        </span>
        {isMutual ? (
          <div className="flex items-center gap-1.5 border-[#F2EBDE] border-t pt-2">
            <span className="text-[#5D7A4A] text-[11px]">
              ✓ Both kept · {ageLabel}
            </span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

/* ---------------- Atoms + helpers ---------------- */

function Eyebrow({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "onDark";
}) {
  const palette = eyebrowPalette(tone);
  return (
    <span
      className={cn(
        "font-semibold text-[11px] uppercase tracking-[0.12em]",
        palette
      )}
    >
      {children}
    </span>
  );
}

function AvatarStack({
  initials,
  small = false,
}: {
  initials: string[];
  small?: boolean;
}) {
  const size = small
    ? "h-[14px] w-[14px] text-[7px]"
    : "h-[18px] w-[18px] text-[9px]";
  return (
    <div className="flex">
      {initials.slice(0, 2).map((c, i) => (
        <span
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-foreground font-bold text-foreground",
            size,
            i > 0 && "-ml-1.5",
            i === 0 ? "bg-[#D8B98B]" : "bg-[#C7A87C]"
          )}
          key={`${c}-${i}`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function eyebrowPalette(tone: "muted" | "primary" | "onDark"): string {
  if (tone === "onDark") {
    return "text-bone/65";
  }
  if (tone === "primary") {
    return "text-primary";
  }
  return "text-muted-foreground";
}

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `£${value.toLocaleString("en-GB")}`;
}

function shortAddressTitle(addressRaw: string): string {
  const idx = addressRaw.indexOf(",");
  if (idx === -1) {
    return addressRaw;
  }
  return addressRaw.slice(0, idx).trim();
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

// Re-export for type-narrowing in callers that want to construct lists.
export type { Member };
