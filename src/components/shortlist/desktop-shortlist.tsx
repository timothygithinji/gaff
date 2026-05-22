/**
 * Desktop Shortlist — two-column workspace shown above the `md`
 * breakpoint. Mirrors the `Desktop · Shortlist` artboard:
 *
 *   - HEADER : "You & <Other>" eyebrow + page title + Sort + Plan-
 *              viewing-day actions, plus a tab strip (Mutual · Yours ·
 *              other members' lists · Archived).
 *   - LEFT   : cinematic featured banner (photo with gradient overlay +
 *              big address/price + Plan a viewing CTA) followed by a
 *              three-column card grid of "Other mutual picks".
 *   - RIGHT  : Saturday-plan summary card (mock until viewing planner
 *              ships) and Shared notes thread (also mock).
 *
 * The notes / plan cards are intentionally placeholder fixtures — the
 * server-side viewing-planner + chat features don't exist yet. The card
 * grid and featured banner consume real `MutualMatch` rows.
 */
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
      <div className="flex min-w-0 flex-1 gap-6 px-10 py-7">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
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
        <aside className="flex w-[300px] shrink-0 flex-col gap-3.5">
          <SaturdayPlanCard plan={DEFAULT_PLAN} />
          <NotesCard notes={DEFAULT_NOTES} />
        </aside>
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
      <div className="flex items-center gap-2.5">
        <SortDropdown onChange={onSortChange} value={sortKey} />
        <button
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-bone text-xs"
          type="button"
        >
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} />
          <span className="font-semibold">Plan viewing day</span>
        </button>
      </div>
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

/* ---------------- Right rail ---------------- */

type PlanEntry = { time: string; title: string };
type Note = {
  by: string;
  initial: string;
  context: string;
  body: string;
  isYou: boolean;
};

function SaturdayPlanCard({ plan }: { plan: PlanEntry[] }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-foreground px-5 py-4">
      <Eyebrow tone="onDark">Saturday plan</Eyebrow>
      <div className="flex flex-col gap-1">
        <p className="font-serif text-[22px] text-bone leading-[26px]">
          {plan.length} viewings, one Saturday
        </p>
        <p className="text-[12px] text-white/55 leading-[16px]">
          Routed by tube. Tea breaks in NW3.
        </p>
      </div>
      <ul className="flex flex-col gap-2.5 border-white/10 border-t pt-3.5">
        {plan.map((p) => (
          <li className="flex items-center gap-2.5" key={p.time}>
            <span className="min-w-[38px] font-semibold font-serif text-[#C7A87C] text-[13px]">
              {p.time}
            </span>
            <span className="font-medium text-[12px] text-bone">{p.title}</span>
          </li>
        ))}
      </ul>
      <button
        className="flex items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 py-2.5 font-semibold text-[12px] text-white"
        type="button"
      >
        Share plan with household
      </button>
    </article>
  );
}

function NotesCard({ notes }: { notes: Note[] }) {
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-4.5 py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Shared notes</Eyebrow>
        <span className="text-[11px] text-muted-foreground">
          {notes.length} unread
        </span>
      </div>
      <ul className="flex flex-col gap-3.5">
        {notes.map((n) => (
          <li className="flex items-start gap-2.5" key={`${n.by}-${n.context}`}>
            <span
              className={cn(
                "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-bold text-[11px] text-foreground",
                n.isYou ? "bg-[#D8B98B]" : "bg-[#C7A87C]"
              )}
            >
              {n.initial}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold text-[12px] text-foreground">
                  {n.by}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {n.context}
                </span>
              </div>
              <p className="text-[12px] text-foreground leading-[17px]">
                {n.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bone px-3 py-2">
        <HugeiconsIcon
          className="text-primary"
          icon={Add01Icon}
          size={12}
          strokeWidth={2}
        />
        <span className="text-[12px] text-muted-foreground">Add a note…</span>
      </div>
    </article>
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

/* ---------------- Placeholder content ---------------- */

const DEFAULT_PLAN: PlanEntry[] = [
  { time: "11:00", title: "Camden Lock Mews" },
  { time: "13:30", title: "Belsize Park Mews" },
  { time: "15:45", title: "Kentish Town Loft" },
];

const DEFAULT_NOTES: Note[] = [
  {
    by: "Partner",
    initial: "P",
    context: "on Camden · 14m ago",
    body: '"Top one for me. Light is unreal in the bedroom photo. Can we book Saturday?"',
    isYou: false,
  },
  {
    by: "You",
    initial: "Y",
    context: "on Highgate · yest.",
    body: '"Walk-up but the studio is huge. Worth the climb?"',
    isYou: true,
  },
];

// Re-export for type-narrowing in callers that want to construct lists.
export type { Member };
