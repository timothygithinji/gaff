/**
 * Desktop Review — three-column workspace shown above the `md` breakpoint.
 * Mirrors the `Desktop · Review` artboard exactly:
 *
 *   - LEFT  : "Up next" queue with mini thumbnails (NOW + 5 upcoming).
 *   - CENTER: Hero card — photo with overlays, big price, address, spec
 *             strip, AI floor-plan verdict chips, action row with
 *             keyboard hints (Z · ← · I · → · S).
 *   - RIGHT : Peareace activity feed, today's decision progress, tip.
 *
 * This file is intentionally presentational — it accepts mock fixtures via
 * the optional `data` prop and falls back to a built-in sample so the
 * artboard renders out-of-the-box. Wire real data by passing a shaped
 * `DesktopReviewData` payload (queue + hero + activity + decisions).
 *
 * Visual contract (locked to artboard):
 *   - Background : `bg-ground` (mineral ground tint).
 *   - Card faces : `bg-card`, `border-border`.
 *   - Accent     : `text-primary` / `bg-primary` (copper).
 *   - Tints      : `bg-bone`, plus a small set of arbitrary `#hex` values
 *                  for the warm/cool scene colors that don't live in the
 *                  semantic token set (peareace tan, soft forest green,
 *                  caution amber).
 */
import {
  AiMagicIcon,
  Alert01Icon,
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  BulbIcon,
  Cancel01Icon,
  FavouriteIcon,
  InformationCircleIcon,
  StarIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { AdminSidebar } from "../layout/admin-sidebar";

/* ---------------- Types ---------------- */

type QueueItem = {
  id: string;
  title: string;
  outcode: string;
  beds: number;
  price: string;
  photo: string;
  /** Indicates Peareace has interacted (kept / noted) the listing. */
  peareaceFlag?: boolean;
  /** Compact suffix like "·3" shown to the right of the row. */
  suffix?: string;
};

type VerdictChip = {
  label: string;
  tone: "positive" | "caution";
};

type ActivityEntry = {
  verb: "Kept" | "Skipped" | "Note";
  target: string;
  meta: string;
  tone: "primary" | "muted";
};

export type DesktopReviewData = {
  searchPill: string;
  headline: string;
  reviewedToday: number;
  keptToday: number;
  skippedToday: number;
  leftToday: number;
  totalToday: number;
  queue: {
    current: QueueItem;
    upcoming: QueueItem[];
    remaining: number;
  };
  hero: {
    photo: string;
    photoIndex: number;
    photoCount: number;
    alsoOn: string;
    price: string;
    priceUnit: string;
    title: string;
    subtitle: string;
    cheapestPortal: string;
    spec: Array<{ label: string; value: string; suffix?: string }>;
    verdicts: VerdictChip[];
  };
  activity: ActivityEntry[];
  tip: { title: string; body: string };
};

/* ---------------- Component ---------------- */

type Props = { data?: DesktopReviewData };

export function DesktopReview({ data = DESKTOP_REVIEW_PLACEHOLDER }: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <DesktopReviewHeader data={data} />
      <div className="flex min-h-0 flex-1 gap-5 px-10 pb-8">
        <QueueRail
          current={data.queue.current}
          remaining={data.queue.remaining}
          upcoming={data.queue.upcoming}
        />
        <HeroColumn hero={data.hero} />
        <ContextRail
          activity={data.activity}
          keptToday={data.keptToday}
          leftToday={data.leftToday}
          skippedToday={data.skippedToday}
          tip={data.tip}
          totalToday={data.totalToday}
        />
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Header ---------------- */

function DesktopReviewHeader({ data }: { data: DesktopReviewData }) {
  return (
    <header className="flex items-end justify-between px-10 pt-9 pb-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Eyebrow>Reviewing</Eyebrow>
          <button
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground text-xs"
            type="button"
          >
            <span className="font-medium">{data.searchPill}</span>
            <HugeiconsIcon
              className="text-muted-foreground"
              icon={ArrowDown01Icon}
              size={10}
              strokeWidth={2}
            />
          </button>
        </div>
        <h1 className="font-serif text-[36px] text-foreground leading-[42px] tracking-tight">
          {data.headline}
        </h1>
      </div>
      <div className="flex items-center gap-3.5">
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[28px] text-foreground leading-none">
              {data.leftToday}
            </span>
            <Eyebrow>Left today</Eyebrow>
          </div>
          <p className="text-muted-foreground text-xs">
            {data.reviewedToday} reviewed · {data.keptToday} kept ·{" "}
            {data.skippedToday} skipped · Peareace too
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-foreground text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-[#2E8B57]" />
          <span className="font-medium">Peareace reviewing too</span>
        </span>
      </div>
    </header>
  );
}

/* ---------------- Queue rail (left) ---------------- */

function QueueRail({
  current,
  upcoming,
  remaining,
}: {
  current: QueueItem;
  upcoming: QueueItem[];
  remaining: number;
}) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <Eyebrow>Up next</Eyebrow>
          <span className="text-[11px] text-muted-foreground">
            {remaining} in queue
          </span>
        </div>
        <span className="flex items-center gap-1 text-primary text-xs">
          <HugeiconsIcon icon={ArrowUp01Icon} size={11} strokeWidth={2} />
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} strokeWidth={2} />
        </span>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <li>
          <QueueRow item={current} isCurrent />
        </li>
        {upcoming.map((item, i) => (
          <li
            className={cn(i < upcoming.length - 1 && "border-bone border-b")}
            key={item.id}
          >
            <QueueRow item={item} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function QueueRow({
  item,
  isCurrent = false,
}: {
  item: QueueItem;
  isCurrent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5",
        isCurrent && "bg-ground"
      )}
    >
      <span
        className={cn("h-9 w-1 shrink-0 rounded-sm", isCurrent && "bg-primary")}
        aria-hidden="true"
      />
      {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
      <img
        alt=""
        className={cn(
          "shrink-0 rounded-lg object-cover",
          isCurrent ? "h-13 w-13" : "h-11 w-11"
        )}
        src={item.photo}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          className={cn(
            "truncate font-serif text-foreground",
            isCurrent ? "text-sm" : "text-[13px]"
          )}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            {item.outcode} · {item.beds} bed
          </span>
          <span className="font-semibold text-[11px] text-foreground">
            {item.price}
          </span>
        </div>
      </div>
      <QueueRowTrailing item={item} isCurrent={isCurrent} />
    </div>
  );
}

function QueueRowTrailing({
  item,
  isCurrent,
}: {
  item: QueueItem;
  isCurrent: boolean;
}) {
  if (isCurrent) {
    return (
      <span className="font-semibold text-[10px] text-primary uppercase tracking-wider">
        Now
      </span>
    );
  }
  if (item.peareaceFlag) {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bone font-bold text-[8px] text-primary">
        P
      </span>
    );
  }
  if (item.suffix) {
    return (
      <span className="font-semibold text-[10px] text-muted-foreground">
        {item.suffix}
      </span>
    );
  }
  return null;
}

/* ---------------- Hero column (center) ---------------- */

function HeroColumn({ hero }: { hero: DesktopReviewData["hero"] }) {
  return (
    <section className="flex w-[540px] shrink-0 flex-col gap-3.5">
      <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <HeroPhoto
          alsoOn={hero.alsoOn}
          photo={hero.photo}
          photoCount={hero.photoCount}
          photoIndex={hero.photoIndex}
        />
        <div className="flex flex-col gap-4 px-7 pt-6">
          <HeroPriceRow
            cheapestPortal={hero.cheapestPortal}
            price={hero.price}
            priceUnit={hero.priceUnit}
            subtitle={hero.subtitle}
            title={hero.title}
          />
          <HeroSpecRow spec={hero.spec} />
          <HeroVerdicts verdicts={hero.verdicts} />
        </div>
        <HeroActions />
      </article>
    </section>
  );
}

function HeroPhoto({
  photo,
  photoIndex,
  photoCount,
  alsoOn,
}: {
  photo: string;
  photoIndex: number;
  photoCount: number;
  alsoOn: string;
}) {
  return (
    <div className="relative h-[280px] w-full">
      {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
      <img
        alt="Listing hero"
        className="absolute inset-0 h-full w-full object-cover"
        src={photo}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent"
      />
      <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E2B584]" />
        <span className="font-semibold text-[10px] text-white uppercase tracking-wider">
          {alsoOn}
        </span>
      </span>
      <span className="absolute top-3.5 right-3.5 rounded-full bg-black/55 px-2.5 py-1 font-semibold text-[11px] text-white">
        {photoIndex} / {photoCount}
      </span>
      <div className="absolute right-4 bottom-3.5 left-4 flex gap-1">
        {Array.from({ length: photoCount }, (_, i) => i).map((i) => (
          <span
            className={cn(
              "h-[3px] flex-1 rounded-sm",
              i < photoIndex ? "bg-white" : "bg-white/35"
            )}
            key={`progress-${i}`}
          />
        ))}
      </div>
    </div>
  );
}

function HeroPriceRow({
  price,
  priceUnit,
  title,
  subtitle,
  cheapestPortal,
}: {
  price: string;
  priceUnit: string;
  title: string;
  subtitle: string;
  cheapestPortal: string;
}) {
  return (
    <div className="flex items-end justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif text-[40px] text-foreground leading-none tracking-tight">
            {price}
          </span>
          <span className="font-medium text-muted-foreground text-sm">
            {priceUnit}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-serif text-[22px] text-foreground">
            {title}
          </span>
          <span className="text-muted-foreground text-xs">· {subtitle}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Eyebrow>Cheapest on</Eyebrow>
        <span className="font-serif text-[18px] text-primary">
          {cheapestPortal}
        </span>
      </div>
    </div>
  );
}

function HeroSpecRow({
  spec,
}: {
  spec: DesktopReviewData["hero"]["spec"];
}) {
  return (
    <div className="flex items-stretch border-bone border-y py-3.5">
      {spec.map((cell, i) => (
        <div className="flex flex-1 items-stretch" key={cell.label}>
          <div className={cn("flex flex-1 flex-col gap-1", i > 0 && "pl-4")}>
            <Eyebrow>{cell.label}</Eyebrow>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-[22px] text-foreground">
                {cell.value}
              </span>
              {cell.suffix ? (
                <span className="text-[11px] text-muted-foreground">
                  {cell.suffix}
                </span>
              ) : null}
            </div>
          </div>
          {i < spec.length - 1 ? (
            <span aria-hidden="true" className="w-px bg-bone" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function HeroVerdicts({ verdicts }: { verdicts: VerdictChip[] }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <HugeiconsIcon
          className="text-primary"
          icon={AiMagicIcon}
          size={12}
          strokeWidth={2}
        />
        <Eyebrow tone="primary">Floor plan read · Claude</Eyebrow>
      </div>
      <div className="flex flex-wrap gap-2">
        {verdicts.map((v) => (
          <Verdict key={v.label} tone={v.tone}>
            {v.label}
          </Verdict>
        ))}
      </div>
    </section>
  );
}

function Verdict({
  tone,
  children,
}: {
  tone: VerdictChip["tone"];
  children: ReactNode;
}) {
  const icon = tone === "positive" ? Tick01Icon : Alert01Icon;
  const palette =
    tone === "positive"
      ? "bg-[#F0E6D2] text-foreground"
      : "bg-[#FBEDDC] text-foreground";
  const iconColor = tone === "positive" ? "text-[#5D7A4A]" : "text-[#B26B3F]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-[13px]",
        palette
      )}
    >
      <HugeiconsIcon
        className={iconColor}
        icon={icon}
        size={12}
        strokeWidth={2.2}
      />
      {children}
    </span>
  );
}

function HeroActions() {
  return (
    <div className="mt-4 flex items-center justify-between border-bone border-t px-7 pt-4 pb-6">
      <div className="flex items-center gap-3.5">
        <ActionPad
          hint="Z · Undo"
          icon={ArrowReloadHorizontalIcon}
          label="Undo last swipe"
          size="sm"
        />
        <ActionPad hint="← Skip" icon={Cancel01Icon} label="Skip" size="md" />
        <ActionPad
          hint="I · Detail"
          icon={InformationCircleIcon}
          label="Details"
          size="sm"
        />
      </div>
      <div className="flex items-center gap-3.5">
        <ActionPad
          hint="→ Keep"
          icon={FavouriteIcon}
          label="Keep"
          size="md"
          variant="primary"
        />
        <ActionPad
          hint="S · Star"
          icon={StarIcon}
          label="Shortlist"
          size="sm"
        />
      </div>
    </div>
  );
}

function ActionPad({
  icon,
  label,
  hint,
  size,
  variant = "ghost",
}: {
  icon: typeof FavouriteIcon;
  label: string;
  hint: string;
  size: "sm" | "md";
  variant?: "ghost" | "primary";
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        aria-label={label}
        className={cn(
          "flex items-center justify-center rounded-full",
          size === "sm" ? "h-11 w-11" : "h-16 w-16",
          variant === "primary"
            ? "bg-primary text-primary-foreground shadow-[0_6px_18px_rgba(155,90,62,0.28)]"
            : "border border-border bg-card text-foreground"
        )}
        type="button"
      >
        <HugeiconsIcon
          icon={icon}
          size={actionIconSize(size, variant)}
          strokeWidth={1.8}
        />
      </button>
      <span
        className={cn(
          "font-semibold text-[10px] uppercase tracking-wider",
          variant === "primary" ? "text-primary" : "text-muted-foreground"
        )}
      >
        {hint}
      </span>
    </div>
  );
}

function actionIconSize(
  size: "sm" | "md",
  variant: "ghost" | "primary"
): number {
  if (size === "sm") {
    return 18;
  }
  return variant === "primary" ? 26 : 22;
}

/* ---------------- Context rail (right) ---------------- */

function ContextRail({
  activity,
  keptToday,
  skippedToday,
  leftToday,
  totalToday,
  tip,
}: {
  activity: ActivityEntry[];
  keptToday: number;
  skippedToday: number;
  leftToday: number;
  totalToday: number;
  tip: DesktopReviewData["tip"];
}) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-3.5">
      <ActivityCard activity={activity} />
      <DecisionsCard
        keptToday={keptToday}
        leftToday={leftToday}
        skippedToday={skippedToday}
        totalToday={totalToday}
      />
      <TipCard tip={tip} />
    </aside>
  );
}

function ActivityCard({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-4.5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C7A87C] font-bold text-[11px] text-foreground">
            P
          </span>
          <span className="font-semibold text-[13px] text-foreground">
            Peareace · last 2h
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-bone px-2 py-0.5">
          <span className="h-[5px] w-[5px] rounded-full bg-[#2E8B57]" />
          <span className="font-semibold text-[#5D7A4A] text-[10px]">
            Online
          </span>
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {activity.map((entry) => (
          <li
            className="flex items-start gap-2.5"
            key={`${entry.verb}-${entry.target}`}
          >
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                entry.tone === "primary" ? "bg-primary" : "bg-[#C7A87C]"
              )}
            />
            <div className="flex flex-col gap-0.5">
              <p className="text-[13px] text-foreground">
                <span className="font-semibold">{entry.verb}</span>{" "}
                {entry.target}
              </p>
              <p className="text-[11px] text-muted-foreground">{entry.meta}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionsCard({
  keptToday,
  skippedToday,
  leftToday,
  totalToday,
}: {
  keptToday: number;
  skippedToday: number;
  leftToday: number;
  totalToday: number;
}) {
  const reviewed = keptToday + skippedToday;
  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-4.5 py-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Your decisions · today</Eyebrow>
        <span className="text-[11px] text-muted-foreground">
          {reviewed} of {totalToday}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span
          className="h-2 rounded-full bg-[#5D7A4A]"
          style={{ flex: Math.max(keptToday, 0.001) }}
          title="Kept"
        />
        <span
          className="h-2 rounded-full bg-border"
          style={{ flex: Math.max(skippedToday, 0.001) }}
          title="Skipped"
        />
        <span
          className="h-2 rounded-full bg-bone"
          style={{ flex: Math.max(leftToday, 0.001) }}
          title="Pending"
        />
      </div>
      <div className="flex items-center justify-between">
        <DecisionStat
          color="bg-[#5D7A4A]"
          label={`${keptToday} kept`}
          meta="Belsize 2 days ago"
        />
        <DecisionStat
          color="bg-[#C7A87C]"
          label={`${skippedToday} skipped`}
          meta="last 1h ago"
        />
        <DecisionStat
          color="bg-border"
          label={`${leftToday} left`}
          meta="~14m to clear"
        />
      </div>
    </div>
  );
}

function DecisionStat({
  color,
  label,
  meta,
}: {
  color: string;
  label: string;
  meta: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
        <span className="font-semibold text-[11px] text-foreground">
          {label}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground">{meta}</span>
    </div>
  );
}

function TipCard({ tip }: { tip: DesktopReviewData["tip"] }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-ground px-3.5 py-3">
      <HugeiconsIcon
        className="mt-0.5 shrink-0 text-primary"
        icon={BulbIcon}
        size={14}
        strokeWidth={1.6}
      />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[12px] text-foreground">{tip.title}</p>
        <p className="text-[11px] text-muted-foreground leading-4">
          {tip.body}
        </p>
      </div>
    </div>
  );
}

/* ---------------- Atoms ---------------- */

function Eyebrow({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "font-semibold text-[11px] uppercase tracking-[0.12em]",
        tone === "primary" ? "text-primary" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Mock data ---------------- */

const PHOTO_HERO =
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1080&q=80";
const PHOTO_BEDROOM =
  "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=200&q=80";
const PHOTO_COOKING =
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=200&q=80";
const PHOTO_HOUSE =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=200&q=80";
const PHOTO_BATH =
  "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=200&q=80";

export const DESKTOP_REVIEW_PLACEHOLDER: DesktopReviewData = {
  searchPill: "North London · 2-bed",
  headline: "Belsize Park Mews, NW3",
  reviewedToday: 5,
  keptToday: 1,
  skippedToday: 4,
  leftToday: 18,
  totalToday: 23,
  queue: {
    remaining: 22,
    current: {
      id: "belsize",
      title: "Belsize Park Mews",
      outcode: "NW3",
      beds: 2,
      price: "£2,450",
      photo: PHOTO_HERO,
    },
    upcoming: [
      {
        id: "camden",
        title: "Camden Lock Mews",
        outcode: "NW1",
        beds: 2,
        price: "£2,300",
        photo: PHOTO_BEDROOM,
        peareaceFlag: true,
      },
      {
        id: "highgate",
        title: "Highgate Studios",
        outcode: "N6",
        beds: 2,
        price: "£2,200",
        photo: PHOTO_COOKING,
        suffix: "·3",
      },
      {
        id: "kentish",
        title: "Kentish Town Loft",
        outcode: "NW5",
        beds: 2,
        price: "£2,550",
        photo: PHOTO_HOUSE,
      },
      {
        id: "hampstead",
        title: "Hampstead Conversion",
        outcode: "NW3",
        beds: 1,
        price: "£2,100",
        photo: PHOTO_BATH,
      },
      {
        id: "tufnell",
        title: "Tufnell Park Garden Flat",
        outcode: "N19",
        beds: 2,
        price: "£2,395",
        photo: PHOTO_BEDROOM,
      },
    ],
  },
  hero: {
    photo: PHOTO_HERO,
    photoIndex: 1,
    photoCount: 12,
    alsoOn: "Also on Zoopla · Rightmove",
    price: "£2,450",
    priceUnit: "/mo",
    title: "Belsize Park Mews",
    subtitle: "NW3 · Listed 2 days ago",
    cheapestPortal: "OpenRent",
    spec: [
      { label: "Beds", value: "2" },
      { label: "Baths", value: "1" },
      { label: "Sq ft", value: "712" },
      { label: "EPC", value: "C" },
      { label: "Commute", value: "28", suffix: "min" },
    ],
    verdicts: [
      { label: "Separate kitchen · 6.8 m²", tone: "positive" },
      { label: "Dual-aspect living", tone: "positive" },
      { label: "Bed 2 fits double, not king", tone: "caution" },
      { label: "Real storage cupboard", tone: "positive" },
    ],
  },
  activity: [
    {
      verb: "Kept",
      target: "Camden Lock Mews",
      meta: "Sent you a Mutual · 2h ago",
      tone: "primary",
    },
    {
      verb: "Skipped",
      target: "Maida Vale Conversion",
      meta: '"No bath." · 3h ago',
      tone: "muted",
    },
    {
      verb: "Note",
      target: "on Highgate Studios",
      meta: '"Floor 3 walk-up is a no." · yest.',
      tone: "muted",
    },
  ],
  tip: {
    title: "Tip · Peareace usually keeps cheaper-than-budget",
    body: "This one's £150 under your £2,600 cap. She might call this a Mutual.",
  },
};
