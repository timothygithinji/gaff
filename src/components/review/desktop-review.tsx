/**
 * Desktop Review — three-column workspace shown above the `lg` breakpoint.
 * Pixel-matched to the Paper "Review · Laptop" artboard (2HG-0):
 *
 *   - LEFT  : "Queue · N left" header + a stack of bordered queue cards
 *             (60px thumbnail · title · price·outcode · spec · furnished/avail).
 *             The current card carries a navy border.
 *   - CENTER: Lead-listing header (eyebrow · big title · spec line) with the
 *             price + cheapest-portal line floated right, the hero photo
 *             (carousel + lightbox), then two cards side by side —
 *             "Floor plan" (AI checklist) and "The numbers"
 *             (commute · EPC).
 *   - RIGHT : "Across portals" portal price comparison, the Keep / Veto
 *             action stack, and a "Today" tally.
 *
 * Presentation only — accepts a shaped `DesktopReviewData` payload and falls
 * back to a built-in sample so the artboard renders out-of-the-box.
 *
 * Visual contract (locked to the artboard):
 *   - Page ground   : `bg-ground` (supplied by AdminSidebar).
 *   - Card faces     : `bg-paper`, `border-line`, 6px radius.
 *   - Eyebrows/labels: `text-slate`, uppercase, 0.12–0.14em tracking.
 *   - Accent         : `text-copper` ("Cheapest" tag, "!" watch-outs, the
 *                      filled Keep heart, the "both kept" tally).
 *   - Fixed-navy faces (blind-veto card, Keep button, the current-card
 *     border, avatar fills) pin literal `#0e2235` / `#eef1f4` so they don't
 *     invert in the dark scene — same rule the app shell follows.
 */
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BathtubIcon,
  BedIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import useEmblaCarousel from "embla-carousel-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
import { useEmblaWheelGestures } from "../../hooks/use-embla-wheel-gestures";
import { useIsMobile } from "../../hooks/use-mobile";
import { outcodeLocationLabel } from "../../lib/outcode-areas";
import { sizedPhoto } from "../../lib/photo-size";
import { propertyKindLabel } from "../../lib/property-kind";
import { cn } from "../../lib/utils";
import { AdminSidebar } from "../layout/admin-sidebar";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { EmptyState } from "../ui/patterns/empty-state";
import { type Pill, severityToken } from "../ui/patterns/feature-pills";
import { PortalList, type PortalRowItem } from "../ui/patterns/portal-list";
import { type StatCell, StatRow } from "../ui/patterns/stat-row";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { DecisionActions } from "./decision-actions";
import {
  EMPTY_QUEUE_FILTERS,
  QueueFilter,
  type QueueFilters,
  matchesQueueFilters,
  queueFilterOptions,
} from "./queue-filter";

/* ---------------- Types ---------------- */

export type DesktopReviewQueueItem = {
  id: string;
  /** Street name, e.g. "Belsize Park Mews". */
  title: string;
  /** Formatted price, e.g. "£2,450". */
  price: string;
  /** Raw monthly rent backing the formatted `price`; null = unknown. Drives the queue filter's max-price facet. */
  priceValue: number | null;
  outcode: string;
  beds: number | null;
  bathrooms: number | null;
  /** Pre-formatted move-in chip, e.g. "Avail now" / "Avail 12 Jun"; null = unknown. */
  availability: string | null;
  /** Days until move-in; 0 = now, null = unknown. Drives the move-in facet. */
  availableInDays: number | null;
  /** Pre-formatted furnishing chip, e.g. "Furnished"; null = unknown. */
  furnished: string | null;
  /** Coarse property kind ("flat" / "house" / "studio" / "share" / "other"). */
  propertyKind: string | null;
  councilTaxBand: string | null;
  epcBand: string | null;
  commuteMinutes: number | null;
  /** Gigabit/FTTP available; null = unknown. */
  fttp: boolean | null;
  /** Distinct portals this cluster is listed on. */
  portalCount: number;
  photo: string;
};


/** The review hero's stat cells use the shared {@link StatCell} shape. */
export type DesktopReviewStatCell = StatCell;

export type DesktopReviewTodayCell = {
  value: string;
  label: string;
  /** Copper-accented value (the "both kept" tally). */
  accent?: boolean;
};

export type DesktopReviewData = {
  queue: {
    items: DesktopReviewQueueItem[];
    /** Total clusters still awaiting a swipe (drives "Queue · N left"). */
    remaining: number;
    /** 1-based position of the current card in the queue. */
    position: number;
    selectedClusterId: string | null;
  };
  hero: {
    photos: string[];
    /** Street name, e.g. "Belsize Park Mews". */
    title: string;
    /** "2 bed · 1 bath · 712 sqft · Listed 2 days ago". */
    subtitle: string;
    price: string;
    priceUnit: string;
    /** AI "what stands out" signals — highlights (✓) + watch-outs (!). */
    signals: Pill[];
    /** The numbers cells: commute · EPC · council tax · size. */
    stats: DesktopReviewStatCell[];
  };
  /** "98% match" or null when we can't score the cluster. */
  matchPct: string | null;
  portals: PortalRowItem[];
  today: {
    cells: DesktopReviewTodayCell[];
    youInitial: string;
    partnerInitial: string | null;
  };
};

/**
 * Which action is mid-flight. Drives the Keep / Veto spinners so the user
 * gets feedback the moment they trigger shortlist/skip/undo.
 */
export type DesktopReviewPendingAction =
  | "skip"
  | "shortlist"
  | "undo"
  | "defer"
  | null;

type Props = {
  data?: DesktopReviewData;
  onSkip?: () => void;
  onShortlist?: () => void;
  /** Pop the last swipe (mirrors the mobile dock's Undo). */
  onUndo?: () => void;
  /** Snooze the listing for `days` (it re-scrapes + re-surfaces later). */
  onDefer?: (days: number) => void;
  onOpenDetail?: () => void;
  /** Repoint the hero to a queued cluster. `null` = back to top of queue. */
  onSelectCluster?: (clusterId: string | null) => void;
  /** Mirror lightbox open state up so the page can gate its hotkeys. */
  onLightboxOpenChange?: (open: boolean) => void;
  /**
   * Queue-rail filter state, lifted to the page so the same filter can
   * drive the mobile card stream. Optional — falls back to internal
   * state so the component still renders standalone (e.g. the artboard).
   */
  filters?: QueueFilters;
  onFiltersChange?: (next: QueueFilters) => void;
  disabled?: boolean;
  pendingAction?: DesktopReviewPendingAction;
};

export function DesktopReview({
  data = DESKTOP_REVIEW_PLACEHOLDER,
  onSkip,
  onShortlist,
  onUndo,
  onDefer,
  onOpenDetail,
  onSelectCluster,
  onLightboxOpenChange,
  filters,
  onFiltersChange,
  disabled,
  pendingAction = null,
}: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <div className="flex min-h-0 w-full flex-1 gap-6 px-8 py-6">
        <QueueRail
          filters={filters}
          items={data.queue.items}
          onFiltersChange={onFiltersChange}
          onSelectCluster={onSelectCluster}
          remaining={data.queue.remaining}
          selectedClusterId={data.queue.selectedClusterId}
        />
        <MainColumn
          hero={data.hero}
          onLightboxOpenChange={onLightboxOpenChange}
          onOpenDetail={onOpenDetail}
        />
        <RightRail
          disabled={disabled}
          matchPct={data.matchPct}
          onDefer={onDefer}
          onOpenDetail={onOpenDetail}
          onShortlist={onShortlist}
          onSkip={onSkip}
          onUndo={onUndo}
          pendingAction={pendingAction}
          portals={data.portals}
          today={data.today}
        />
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Queue rail (left) ---------------- */

function QueueRail({
  items,
  remaining,
  selectedClusterId,
  onSelectCluster,
  filters: filtersProp,
  onFiltersChange,
}: {
  items: DesktopReviewQueueItem[];
  remaining: number;
  selectedClusterId: string | null;
  onSelectCluster?: (clusterId: string | null) => void;
  filters?: QueueFilters;
  onFiltersChange?: (next: QueueFilters) => void;
}) {
  // Keep the selected row visible as ↑/↓ walk the queue.
  const currentRowRef = useRef<HTMLLIElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedClusterId is the intentional re-scroll trigger — when it changes the ref already points at the newly-selected row.
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedClusterId]);

  // Filters are normally lifted to the page (so mobile shares them); fall
  // back to local state when rendered standalone. Client-side narrowing of
  // the already-loaded queue — see queue-filter.tsx.
  const [localFilters, setLocalFilters] =
    useState<QueueFilters>(EMPTY_QUEUE_FILTERS);
  const filters = filtersProp ?? localFilters;
  const setFilters = onFiltersChange ?? setLocalFilters;
  const options = queueFilterOptions(items);
  const visible = items.filter((item) => matchesQueueFilters(item, filters));
  const isFiltered = visible.length !== items.length;

  return (
    <aside className="flex min-h-0 w-60 shrink-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-0.5">
        <Eyebrow>
          {isFiltered
            ? `Queue · ${visible.length} of ${remaining}`
            : `Queue · ${remaining} left`}
        </Eyebrow>
        <QueueFilter filters={filters} onChange={setFilters} options={options} />
      </div>
      {/* Independent scroll: the rail keeps its header pinned while the
          queue itself scrolls, so a long queue never pushes the hero or
          right rail off-screen. */}
      {visible.length > 0 ? (
        <ul className="-mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2">
          {visible.map((item) => {
            const isCurrent = item.id === selectedClusterId;
            return (
              <li key={item.id} ref={isCurrent ? currentRowRef : undefined}>
                <QueueCard
                  isCurrent={isCurrent}
                  item={item}
                  onSelect={
                    onSelectCluster ? () => onSelectCluster(item.id) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          action={
            <button
              className="font-medium text-[11px] text-navy underline-offset-2 hover:underline"
              onClick={() => setFilters(EMPTY_QUEUE_FILTERS)}
              type="button"
            >
              Clear filters
            </button>
          }
          body="No queued listings match these filters."
          className="flex-1"
          variant="inline"
        />
      )}
    </aside>
  );
}

function QueueCard({
  item,
  isCurrent,
  onSelect,
}: {
  item: DesktopReviewQueueItem;
  isCurrent: boolean;
  onSelect?: () => void;
}) {
  return (
    // biome-ignore lint/nursery/useAriaPropsSupportedByRole: aria-current is a global ARIA attribute, valid on buttons used as queue items.
    <button
      aria-current={isCurrent ? "true" : undefined}
      className={cn(
        "flex w-full items-stretch gap-3 rounded-[6px] border bg-paper p-2.5 text-left transition-colors",
        isCurrent
          ? "border-[#0e2235]"
          : "border-line hover:border-steel/60 active:scale-[0.99]"
      )}
      onClick={onSelect}
      type="button"
    >
      {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
      <img
        alt=""
        className="size-[60px] shrink-0 rounded-[4px] object-cover"
        src={sizedPhoto(item.photo, 64)}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate font-semibold text-[12px] text-navy leading-4">
          {item.title}
        </p>
        <p className="truncate text-[11px] text-slate leading-[14px]">
          {[
            item.price,
            propertyKindLabel(item.propertyKind),
            outcodeLocationLabel(item.outcode) ?? item.outcode,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <QueueSpec baths={item.bathrooms} beds={item.beds} />
        <QueueMeta availability={item.availability} furnished={item.furnished} />
      </div>
    </button>
  );
}

/** Beds + baths row with icons (skips a value we don't have). */
function QueueSpec({
  beds,
  baths,
}: {
  beds: number | null;
  baths: number | null;
}) {
  if (beds == null && baths == null) {
    return null;
  }
  return (
    <span className="flex items-center gap-2.5 pt-0.5 text-[10px] text-slate leading-3">
      {beds != null ? (
        <span className="flex items-center gap-1">
          <HugeiconsIcon icon={BedIcon} size={11} strokeWidth={1.8} />
          {beds}
        </span>
      ) : null}
      {baths != null ? (
        <span className="flex items-center gap-1">
          <HugeiconsIcon icon={BathtubIcon} size={11} strokeWidth={1.8} />
          {baths}
        </span>
      ) : null}
    </span>
  );
}

/** Furnishing + move-in chips; renders nothing when neither is known. */
function QueueMeta({
  furnished,
  availability,
}: {
  furnished: string | null;
  availability: string | null;
}) {
  const parts = [furnished, availability].filter(
    (p): p is string => p != null
  );
  if (parts.length === 0) {
    return null;
  }
  return (
    <p className="truncate pt-0.5 text-[10px] text-steel leading-3">
      {parts.join(" · ")}
    </p>
  );
}

/* ---------------- Main column (center) ---------------- */

function MainColumn({
  hero,
  onOpenDetail,
  onLightboxOpenChange,
}: {
  hero: DesktopReviewData["hero"];
  onOpenDetail?: () => void;
  onLightboxOpenChange?: (open: boolean) => void;
}) {
  return (
    <section className="-mr-2 flex min-h-0 min-w-0 flex-1 flex-col gap-[18px] overflow-y-auto pr-2">
      <LeadHeader hero={hero} onOpenDetail={onOpenDetail} />
      <HeroPhoto
        onLightboxOpenChange={onLightboxOpenChange}
        photos={hero.photos}
      />
      <div className="flex items-stretch gap-[18px]">
        <WhatStandsOutCard signals={hero.signals} />
        <StatRow stats={hero.stats} variant="card" />
      </div>
    </section>
  );
}

function LeadHeader({
  hero,
  onOpenDetail,
}: {
  hero: DesktopReviewData["hero"];
  onOpenDetail?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <button
          className="max-w-full truncate text-left font-semibold text-[32px] text-navy leading-[32px] tracking-[-0.025em] transition-opacity hover:opacity-80"
          disabled={!onOpenDetail}
          onClick={onOpenDetail}
          title="View full details"
          type="button"
        >
          {hero.title}
        </button>
        <p className="pt-0.5 text-[13px] text-slate leading-4">
          {hero.subtitle}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-baseline gap-1">
          <span className="font-light text-[38px] text-navy leading-[38px] tracking-[-0.02em]">
            {hero.price}
          </span>
          <span className="text-[13px] text-slate leading-4">
            {hero.priceUnit}
          </span>
        </div>
      </div>
    </div>
  );
}

function HeroPhoto({
  photos,
  onLightboxOpenChange,
}: {
  photos: string[];
  onLightboxOpenChange?: (open: boolean) => void;
}) {
  const photoCount = photos.length;
  const canPaginate = photoCount > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: 28,
    watchDrag: canPaginate,
  });
  const index = useEmblaSelectedIndex(emblaApi);
  useEmblaWheelGestures(emblaApi);

  // New card → snap back to the first photo without animation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: photos is the intentional re-run trigger.
  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    emblaApi.scrollTo(0, true);
  }, [emblaApi, photos]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isMobile = useIsMobile();
  const heroKeysEnabled = !lightboxOpen && !isMobile && canPaginate;
  useHotkey("ArrowLeft", scrollPrev, {
    enabled: heroKeysEnabled,
    meta: { category: "Review", description: "Previous photo" },
  });
  useHotkey("ArrowRight", scrollNext, {
    enabled: heroKeysEnabled,
    meta: { category: "Review", description: "Next photo" },
  });
  const openLightbox = useCallback(() => setLightboxOpen(true), []);
  useHotkey("F", openLightbox, {
    enabled: !lightboxOpen && !isMobile && photoCount > 0,
    meta: { category: "Review", description: "View photo fullscreen" },
  });

  useEffect(() => {
    onLightboxOpenChange?.(lightboxOpen);
  }, [lightboxOpen, onLightboxOpenChange]);

  if (photoCount === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[6px] bg-[#c9d3dc]">
        <span className="text-[12px] text-slate">No photos</span>
      </div>
    );
  }

  return (
    <div className="group relative aspect-[4/3] w-full select-none overflow-hidden rounded-[6px] bg-[#c9d3dc]">
      <div className="h-full w-full overflow-hidden" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {photos.map((src, i) => (
            <button
              aria-label={`Open photo ${i + 1} in fullscreen`}
              className="relative h-full min-w-0 flex-[0_0_100%] cursor-zoom-in"
              key={`slide-${src}-${i}`}
              onClick={openLightbox}
              type="button"
            >
              {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
              <img
                alt={`Listing view ${i + 1}`}
                className="h-full w-full object-cover"
                draggable={false}
                src={sizedPhoto(src, 900)}
              />
            </button>
          ))}
        </div>
      </div>

      {canPaginate ? (
        <>
          <button
            aria-label="Previous photo"
            className="-translate-y-1/2 absolute top-1/2 left-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            onClick={scrollPrev}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          </button>
          <button
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-10 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            onClick={scrollNext}
            type="button"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} />
          </button>
        </>
      ) : null}

      <PhotoLightbox
        onOpenChange={setLightboxOpen}
        open={lightboxOpen}
        photos={photos}
        startIndex={index}
      />

      {canPaginate ? (
        <div className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5">
          {photos.map((src, i) => (
            <button
              aria-label={`Go to photo ${i + 1}`}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === index ? "bg-white" : "bg-white/40 hover:bg-white/70"
              )}
              key={`dot-${src}-${i}`}
              onClick={() => scrollTo(i)}
              type="button"
            />
          ))}
        </div>
      ) : null}

      <span className="pointer-events-none absolute right-3.5 bottom-3.5 bg-[rgba(255,255,255,0.92)] px-2.5 py-[5px] text-[#0e2235] text-[11px] tracking-[0.08em]">
        {index + 1} / {photoCount}
      </span>
    </div>
  );
}

function PhotoLightbox({
  open,
  onOpenChange,
  photos,
  startIndex,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: string[];
  startIndex: number;
}) {
  const photoCount = photos.length;
  const canPaginate = photoCount > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: 28,
    startIndex,
    watchDrag: canPaginate,
  });
  const index = useEmblaSelectedIndex(emblaApi, startIndex);
  useEmblaWheelGestures(emblaApi);

  useEffect(() => {
    if (open && emblaApi) {
      emblaApi.scrollTo(startIndex, true);
    }
  }, [open, emblaApi, startIndex]);

  useHotkey("ArrowLeft", () => emblaApi?.scrollPrev(), { enabled: open });
  useHotkey("ArrowRight", () => emblaApi?.scrollNext(), { enabled: open });
  useHotkey("Escape", () => onOpenChange(false), {
    enabled: open,
    meta: { category: "Review", description: "Close fullscreen" },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid h-[95vh] w-[95vw] max-w-none place-items-stretch gap-0 overflow-hidden border-0 bg-black/95 p-0 ring-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Listing photos</DialogTitle>
        <div className="relative flex h-full w-full items-center justify-center">
          <div className="h-full w-full overflow-hidden" ref={emblaRef}>
            <div className="flex h-full touch-pan-y">
              {photos.map((src, i) => (
                <div
                  className="relative flex h-full min-w-0 flex-[0_0_100%] items-center justify-center"
                  key={`lightbox-slide-${src}-${i}`}
                >
                  {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
                  <img
                    alt={`Listing view ${i + 1}`}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                    src={src}
                  />
                </div>
              ))}
            </div>
          </div>
          {canPaginate ? (
            <>
              <button
                aria-label="Previous photo"
                className="-translate-y-1/2 absolute top-1/2 left-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                onClick={() => emblaApi?.scrollPrev()}
                type="button"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={2} />
              </button>
              <button
                aria-label="Next photo"
                className="-translate-y-1/2 absolute top-1/2 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                onClick={() => emblaApi?.scrollNext()}
                type="button"
              >
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={20}
                  strokeWidth={2}
                />
              </button>
            </>
          ) : null}
          <span className="-translate-x-1/2 pointer-events-none absolute top-4 left-1/2 rounded-full bg-white/10 px-3 py-1.5 font-medium text-white text-xs backdrop-blur">
            {index + 1} / {photoCount}
          </span>
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Six slots (2 columns × 3 rows) — fixes the card height so it doesn't jump
 *  with the signal count. */
const WHAT_STANDS_OUT_SLOTS = 6;

/**
 * A single signal label: truncated to one line so the 2-up grid keeps its
 * column rhythm, with a tooltip revealing the full text only when it actually
 * overflows (measured against its rendered width, re-checked on resize).
 */
function SignalLabel({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="min-w-0 flex-1 truncate text-[13px] text-navy leading-4"
            ref={ref}
          >
            {label}
          </span>
        }
      />
      {overflowing ? <TooltipContent>{label}</TooltipContent> : null}
    </Tooltip>
  );
}

function WhatStandsOutCard({ signals }: { signals: Pill[] }) {
  const items = signals.slice(0, WHAT_STANDS_OUT_SLOTS);
  return (
    <article className="flex flex-[1.3] flex-col rounded-[6px] border border-line bg-paper p-[18px]">
      <div className="pb-3">
        <Eyebrow>What stands out</Eyebrow>
      </div>
      {items.length > 0 ? (
        // Always render all six slots (empty ones reserve their row) so the
        // card holds a constant height regardless of how many signals exist.
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {Array.from({ length: WHAT_STANDS_OUT_SLOTS }).map((_, i) => {
            const item = items[i];
            if (!item) {
              return <li className="h-5" key={`slot-${i}`} />;
            }
            const tone = severityToken(item.severity);
            return (
              <li
                className="flex h-5 min-w-0 items-center gap-2"
                key={item.label}
              >
                <HugeiconsIcon
                  className={cn("shrink-0", tone.text)}
                  icon={tone.icon}
                  size={14}
                  strokeWidth={2.4}
                />
                <SignalLabel label={item.label} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-slate leading-4">
          No AI read yet — highlights appear once the listing is enriched.
        </p>
      )}
    </article>
  );
}

/* ---------------- Right rail ---------------- */

function RightRail({
  matchPct,
  portals,
  today,
  onSkip,
  onShortlist,
  onUndo,
  onDefer,
  onOpenDetail,
  disabled,
  pendingAction,
}: {
  matchPct: string | null;
  portals: PortalRowItem[];
  today: DesktopReviewData["today"];
  onSkip?: () => void;
  onShortlist?: () => void;
  onUndo?: () => void;
  onDefer?: (days: number) => void;
  onOpenDetail?: () => void;
  disabled?: boolean;
  pendingAction?: DesktopReviewPendingAction;
}) {
  return (
    <aside className="-mr-2 flex min-h-0 w-[280px] shrink-0 flex-col gap-4 overflow-y-auto pr-2">
      <TodayPanel today={today} />
      <PortalsPanel matchPct={matchPct} portals={portals} />
      <DecisionActions
        disabled={disabled}
        onDefer={onDefer}
        onOpenDetail={onOpenDetail}
        onShortlist={onShortlist}
        onSkip={onSkip}
        onUndo={onUndo}
        orientation="vertical"
        pendingAction={pendingAction}
      />
    </aside>
  );
}

function PortalsPanel({
  matchPct,
  portals,
}: {
  matchPct: string | null;
  portals: PortalRowItem[];
}) {
  if (portals.length === 0) {
    return null;
  }
  const hasSpread = portals.some(
    (p) => !p.isHeadline && (p.deltaFromHeadline ?? 0) > 0
  );
  return (
    <section className="flex flex-col gap-2.5 rounded-[6px] border border-line bg-paper p-[18px]">
      <div className="flex items-center justify-between">
        <Eyebrow>Across portals</Eyebrow>
        {matchPct ? (
          <span className="font-semibold text-[11px] text-navy leading-[14px]">
            {matchPct} match
          </span>
        ) : null}
      </div>
      <PortalList hasSpread={hasSpread} rows={portals} variant="rail" />
    </section>
  );
}

function TodayPanel({ today }: { today: DesktopReviewData["today"] }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-[6px] border border-line bg-paper p-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Today</Eyebrow>
        <div className="flex shrink-0">
          <span className="flex size-[18px] items-center justify-center rounded-full border-2 border-white bg-[#0e2235] font-semibold text-[#eef1f4] text-[9px]">
            {today.youInitial}
          </span>
          {today.partnerInitial ? (
            <span className="-ml-1.5 flex size-[18px] items-center justify-center rounded-full border-2 border-white bg-[#d77a4a] font-semibold text-[9px] text-white">
              {today.partnerInitial}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex gap-[18px]">
        {today.cells.map((cell) => (
          <div className="flex flex-col gap-0.5" key={cell.label}>
            <span
              className={cn(
                "font-medium text-[22px] leading-[22px]",
                cell.accent ? "text-copper" : "text-navy"
              )}
            >
              {cell.value}
            </span>
            <span className="text-[10px] text-slate leading-3">
              {cell.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Atoms ---------------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className='font-semibold text-[10px] text-slate uppercase leading-3 tracking-[0.14em]'>
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
  queue: {
    remaining: 23,
    position: 1,
    selectedClusterId: "belsize",
    items: [
      {
        id: "belsize",
        title: "Belsize Park Mews",
        price: "£2,450",
        priceValue: 2450,
        outcode: "NW3",
        beds: 2,
        bathrooms: 1,
        availability: "Avail now",
        availableInDays: 0,
        furnished: "Furnished",
        propertyKind: "house",
        councilTaxBand: "D",
        epcBand: "C",
        commuteMinutes: 24,
        fttp: true,
        portalCount: 2,
        photo: PHOTO_HERO,
      },
      {
        id: "camden",
        title: "Camden Lock Studio",
        price: "£2,200",
        priceValue: 2200,
        outcode: "NW1",
        beds: 1,
        bathrooms: 1,
        availability: "Avail 12 Jun",
        availableInDays: 10,
        furnished: "Unfurnished",
        propertyKind: "studio",
        councilTaxBand: "C",
        epcBand: "D",
        commuteMinutes: 18,
        fttp: false,
        portalCount: 1,
        photo: PHOTO_BEDROOM,
      },
      {
        id: "highgate",
        title: "Highgate Studios",
        price: "£2,300",
        priceValue: 2300,
        outcode: "N6",
        beds: 2,
        bathrooms: 1,
        availability: "Avail now",
        availableInDays: 0,
        furnished: "Part furnished",
        propertyKind: "flat",
        councilTaxBand: "D",
        epcBand: "B",
        commuteMinutes: 32,
        fttp: true,
        portalCount: 3,
        photo: PHOTO_COOKING,
      },
      {
        id: "kentish",
        title: "Kentish Town Loft",
        price: "£2,550",
        priceValue: 2550,
        outcode: "NW5",
        beds: 2,
        bathrooms: 2,
        availability: "Avail 1 Jul",
        availableInDays: 28,
        furnished: "Furnished",
        propertyKind: "flat",
        councilTaxBand: "E",
        epcBand: "C",
        commuteMinutes: 40,
        fttp: false,
        portalCount: 1,
        photo: PHOTO_HOUSE,
      },
      {
        id: "tufnell",
        title: "Tufnell Park Garden",
        price: "£2,650",
        priceValue: 2650,
        outcode: "N19",
        beds: 2,
        bathrooms: 1,
        availability: "Avail now",
        availableInDays: 0,
        furnished: "Unfurnished",
        propertyKind: "house",
        councilTaxBand: "E",
        epcBand: "D",
        commuteMinutes: 27,
        fttp: true,
        portalCount: 2,
        photo: PHOTO_BATH,
      },
      {
        id: "hampstead",
        title: "Hampstead Bridge",
        price: "£2,600",
        priceValue: 2600,
        outcode: "NW3",
        beds: 3,
        bathrooms: 1,
        availability: "Avail 20 Jun",
        availableInDays: 18,
        furnished: "Furnished",
        propertyKind: "flat",
        councilTaxBand: "F",
        epcBand: "C",
        commuteMinutes: 35,
        fttp: false,
        portalCount: 1,
        photo: PHOTO_BEDROOM,
      },
    ],
  },
  hero: {
    photos: [PHOTO_HERO, PHOTO_BEDROOM, PHOTO_COOKING],
    title: "Belsize Park Mews",
    subtitle: "2 bed · 1 bath · 712 sqft · Listed 2 days ago",
    price: "£2,450",
    priceUnit: "/mo",
    signals: [
      { label: "Separate kitchen, 6.8 m²", severity: "positive", detail: null },
      {
        label: "Dual-aspect living, west onto Belsize Lane",
        severity: "positive",
        detail: null,
      },
      { label: "Bed 1 · 14.2 m² · king-suitable", severity: "positive", detail: null },
      {
        label: "Bed 2 · 8.1 m² · double only, not king",
        severity: "caution",
        detail: null,
      },
    ],
    stats: [
      { label: "Transport", value: "8", unit: "min", sub: "Belsize Park" },
      { label: "EPC", value: "C", tone: "good" },
      { label: "Council tax", value: "C", sub: "band" },
      { label: "Size", value: "712", unit: "sq ft" },
    ],
  },
  matchPct: "98%",
  portals: [
    {
      portal: "openrent",
      url: "https://www.openrent.co.uk/",
      priceMonthly: 2450,
      agentName: null,
      agentEmail: null,
      deltaFromHeadline: null,
      isHeadline: true,
    },
    {
      portal: "rightmove",
      url: "https://www.rightmove.co.uk/",
      priceMonthly: 2500,
      agentName: null,
      agentEmail: null,
      deltaFromHeadline: 50,
      isHeadline: false,
    },
    {
      portal: "zoopla",
      url: "https://www.zoopla.co.uk/",
      priceMonthly: 2500,
      agentName: null,
      agentEmail: null,
      deltaFromHeadline: 50,
      isHeadline: false,
    },
  ],
  today: {
    youInitial: "T",
    partnerInitial: "P",
    cells: [
      { value: "8", label: "kept by you" },
      { value: "5", label: "by Partner" },
      { value: "3", label: "both kept", accent: true },
    ],
  },
};
