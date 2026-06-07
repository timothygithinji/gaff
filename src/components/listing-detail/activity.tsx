import { cn } from "../../lib/utils";
/**
 * "Household activity" — the swipe timeline for a cluster: who kept it,
 * who's still to decide, and how long it's been tracked.
 *
 * Two presentations of the same content (the `costs.tsx` convention):
 *   - `<Activity>`     — mobile listing-detail shell (bare section + the
 *     shared bordered box, matching its `<PublicRecords>` siblings).
 *   - `<ActivityCard>` — desktop side-rail shell (bordered card to match
 *     `<CostsCard>` / `<RecordsCard>`).
 *
 * Both derive their items from the same {@link buildActivityItems} so the
 * two device trees can't drift apart.
 */
import type { ListingDetailPartnerSwipe } from "../../server/functions/listing-detail";
import { portalLabel } from "../ui/patterns/portal-list";
import { SectionLabel } from "./section-label";

type Outcome = "keep" | "skip" | "shortlist";

type Props = {
  mySwipe?: Outcome | null;
  mySwipeAt: string | null;
  partnerSwipes: ListingDetailPartnerSwipe[];
  portalCount: number;
  firstSeenPortal: string;
  firstSeenAt: string;
};

type ActivityItem = {
  title: string;
  sub: string;
  active: boolean;
  date: string | null;
};

const WHITESPACE_RE = /\s+/;

function firstName(name: string): string {
  return (name || "").trim().split(WHITESPACE_RE)[0] || name;
}

function buildActivityItems({
  mySwipe,
  mySwipeAt,
  partnerSwipes,
  portalCount,
  firstSeenPortal,
  firstSeenAt,
}: Props): ActivityItem[] {
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  const items: ActivityItem[] = [];
  if (iKept) {
    const waiting = partnerSwipes
      .filter((s) => !(s.outcome === "keep" || s.outcome === "shortlist"))
      .map((s) => firstName(s.name));
    items.push({
      title: "You kept this",
      sub:
        waiting.length > 0 ? `Waiting on ${waiting.join(", ")}` : "Shortlisted",
      active: true,
      date: relativeFromNow(mySwipeAt),
    });
  }
  for (const partner of partnerSwipes) {
    const kept = partner.outcome === "keep" || partner.outcome === "shortlist";
    if (kept) {
      items.push({
        title: `${firstName(partner.name)} kept this`,
        sub: "Shortlisted",
        active: false,
        date: relativeFromNow(partner.swipedAt),
      });
    }
  }
  items.push({
    title: portalCount > 1 ? `Found on ${portalCount} portals` : "Tracking",
    sub: `First seen on ${portalLabel(firstSeenPortal)}`,
    active: false,
    date: relativeFromNow(firstSeenAt),
  });
  return items;
}

function ActivityBody({ items }: { items: ActivityItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div
          className="flex items-start justify-between gap-2.5"
          key={`${item.title}:${item.sub}`}
        >
          <div className="flex min-w-0 gap-2.5">
            <span
              className={cn(
                "mt-[5px] size-1.5 shrink-0 rounded-full",
                item.active ? "bg-copper" : "bg-line"
              )}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[13px] text-foreground leading-4">
                {item.title}
              </p>
              <p className="text-[11px] text-slate leading-[14px]">
                {item.sub}
              </p>
            </div>
          </div>
          {item.date ? (
            <span className="mt-[3px] shrink-0 text-[11px] text-fog leading-[14px]">
              {item.date}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Mobile-shell variant: bare section + bordered box, matching siblings. */
export function Activity(props: Props) {
  const items = buildActivityItems(props);
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>Household activity</SectionLabel>
      <div className="rounded-md border border-line bg-card p-4">
        <ActivityBody items={items} />
      </div>
    </section>
  );
}

/** Desktop side-rail variant: bordered card to match `<CostsCard>` etc. */
export function ActivityCard(props: Props) {
  const items = buildActivityItems(props);
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-line bg-card p-[22px]">
      <SectionLabel>Household activity</SectionLabel>
      <ActivityBody items={items} />
    </article>
  );
}

/**
 * Relative-time label ("just now" / "12 min ago" / "3 hr ago" / "2 days ago"
 * / "5 wk ago"), or null for a missing/invalid timestamp. Computed at render
 * time like `listedAgoLabel` — fine for day/hour granularity.
 */
function relativeFromNow(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) {
    return null;
  }
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins} min ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs} hr ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  return `${Math.floor(days / 7)} wk ago`;
}
