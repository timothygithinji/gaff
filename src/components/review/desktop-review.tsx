/**
 * Desktop Review — three-column workspace shown above the `md` breakpoint.
 * Mirrors the `Desktop · Review` artboard exactly:
 *
 *   - LEFT  : "Up next" queue with mini thumbnails (NOW + 5 upcoming).
 *   - CENTER: Hero card — photo with overlays, big price, address, spec
 *             strip, AI floor-plan verdict chips, action row with
 *             keyboard hints (Z · S · I · L · K).
 *   - RIGHT : Partner activity feed, today's decision progress, tip.
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
  ArrowLeft01Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  FavouriteIcon,
  InformationCircleIcon,
  Loading03Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Link } from "@tanstack/react-router";
import useEmblaCarousel from "embla-carousel-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";
import { AdminSidebar } from "../layout/admin-sidebar";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Kbd } from "../ui/kbd";

/* ---------------- Types ---------------- */

type QueueItem = {
  id: string;
  title: string;
  outcode: string;
  beds: number;
  price: string;
  photo: string;
  /** Indicates Partner has interacted (kept / noted) the listing. */
  peareaceFlag?: boolean;
  /** Compact suffix like "·3" shown to the right of the row. */
  suffix?: string;
};

type VerdictChip = {
  label: string;
  tone: "positive" | "caution";
};

export type DesktopReviewData = {
  /**
   * Every active search the household has — feeds the search-pill
   * dropdown. The "All searches" option is synthesised at render time;
   * `selectedSearchId === null` represents it.
   */
  searchOptions: Array<{ id: string; name: string }>;
  selectedSearchId: string | null;
  reviewedToday: number;
  keptToday: number;
  skippedToday: number;
  leftToday: number;
  queue: {
    /**
     * Every cluster still in the ranked queue, in order. The hero is
     * pinned to whichever item's id matches `selectedClusterId`; the
     * matching row gets the bigger thumbnail and the copper "NOW" mark.
     */
    items: QueueItem[];
    remaining: number;
    selectedClusterId: string | null;
  };
  hero: {
    photos: string[];
    alsoOn: string;
    price: string;
    priceUnit: string;
    title: string;
    subtitle: string;
    cheapestPortal: string;
    spec: Array<{ label: string; value: string; suffix?: string }>;
    verdicts: VerdictChip[];
  };
};

/* ---------------- Component ---------------- */

/**
 * Which action is currently mid-flight. Drives the per-button spinner
 * in {@link HeroActions} so the user sees feedback the moment they
 * trigger shortlist/skip/undo. `null` means nothing is pending.
 */
export type DesktopReviewPendingAction = "skip" | "shortlist" | "undo" | null;

type Props = {
  data?: DesktopReviewData;
  onSkip?: () => void;
  onShortlist?: () => void;
  onUndo?: () => void;
  onOpenDetail?: () => void;
  /**
   * Fired when the user picks a search from the header dropdown.
   * `null` means "All searches" — wire it into the route's `searchId`
   * URL param so the selection survives refresh.
   */
  onSelectSearch?: (searchId: string | null) => void;
  /**
   * Fired when a row in the queue rail is clicked. Wire to the route's
   * `clusterId` URL param so the hero re-points without leaving the
   * review screen. `null` means "back to top of queue".
   */
  onSelectCluster?: (clusterId: string | null) => void;
  /**
   * Fired whenever the photo lightbox opens or closes. The page (route)
   * uses this to disable its keep/skip/shortlist/undo hotkeys while the
   * lightbox owns the keyboard.
   */
  onLightboxOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  pendingAction?: DesktopReviewPendingAction;
};

export function DesktopReview({
  data = DESKTOP_REVIEW_PLACEHOLDER,
  onSkip,
  onShortlist,
  onUndo,
  onOpenDetail,
  onSelectSearch,
  onSelectCluster,
  onLightboxOpenChange,
  disabled,
  pendingAction = null,
}: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <DesktopReviewHeader data={data} onSelectSearch={onSelectSearch} />
      <div className="flex min-h-0 flex-1 gap-5 px-10 pb-8">
        <QueueRail
          items={data.queue.items}
          onSelectCluster={onSelectCluster}
          selectedClusterId={data.queue.selectedClusterId}
        />
        <HeroColumn
          disabled={disabled}
          hero={data.hero}
          onLightboxOpenChange={onLightboxOpenChange}
          onOpenDetail={onOpenDetail}
          onShortlist={onShortlist}
          onSkip={onSkip}
          onUndo={onUndo}
          pendingAction={pendingAction}
        />
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Header ---------------- */

function DesktopReviewHeader({
  data,
  onSelectSearch,
}: {
  data: DesktopReviewData;
  onSelectSearch?: (searchId: string | null) => void;
}) {
  const selectedSearch = data.selectedSearchId
    ? data.searchOptions.find((s) => s.id === data.selectedSearchId)
    : null;
  const pillLabel = selectedSearch ? selectedSearch.name : "All searches";
  return (
    <header className="flex items-end justify-between px-10 pt-9 pb-6">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <Eyebrow>Your queue</Eyebrow>
          <h1 className="font-serif text-[40px] text-foreground leading-[44px] tracking-tight">
            Review
          </h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground text-xs transition-colors hover:bg-ground active:scale-[0.98]"
                type="button"
              />
            }
          >
            <span className="font-medium">{pillLabel}</span>
            <HugeiconsIcon
              className="text-muted-foreground"
              icon={ArrowDown01Icon}
              size={10}
              strokeWidth={2}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6}>
            <DropdownMenuItem
              onClick={() => onSelectSearch?.(null)}
              render={
                <button
                  className={cn(
                    "w-full",
                    data.selectedSearchId === null && "font-semibold"
                  )}
                  type="button"
                />
              }
            >
              All searches
            </DropdownMenuItem>
            {data.searchOptions.length > 0 ? <DropdownMenuSeparator /> : null}
            {data.searchOptions.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => onSelectSearch?.(s.id)}
                render={
                  <button
                    className={cn(
                      "w-full",
                      data.selectedSearchId === s.id && "font-semibold"
                    )}
                    type="button"
                  />
                }
              >
                {s.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link className="block text-muted-foreground" to="/searches" />
              }
            >
              Manage searches…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            {data.skippedToday} skipped
          </p>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Queue rail (left) ---------------- */

function QueueRail({
  items,
  selectedClusterId,
  onSelectCluster,
}: {
  items: QueueItem[];
  selectedClusterId: string | null;
  onSelectCluster?: (clusterId: string | null) => void;
}) {
  return (
    <aside className="flex min-h-0 w-[260px] shrink-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex shrink-0 items-baseline justify-between border-bone border-b px-4 py-3">
          <Eyebrow>Up next</Eyebrow>
        </div>
        <ul className="flex flex-1 flex-col overflow-y-auto">
          {items.map((item, i) => {
            const isCurrent = item.id === selectedClusterId;
            return (
              <li
                className={cn(i < items.length - 1 && "border-bone border-b")}
                key={item.id}
              >
                <QueueRow
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
      </div>
    </aside>
  );
}

function QueueRow({
  item,
  isCurrent = false,
  onSelect,
}: {
  item: QueueItem;
  isCurrent?: boolean;
  onSelect?: () => void;
}) {
  return (
    // biome-ignore lint/nursery/useAriaPropsSupportedByRole: aria-current is a global ARIA attribute and is valid on buttons used as queue items.
    <button
      aria-current={isCurrent ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-ground",
        isCurrent && "bg-ground"
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn("h-9 w-1 shrink-0 rounded-sm", isCurrent && "bg-primary")}
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
            "truncate text-left font-serif text-foreground",
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
    </button>
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

function HeroColumn({
  hero,
  onSkip,
  onShortlist,
  onUndo,
  onOpenDetail,
  onLightboxOpenChange,
  disabled,
  pendingAction,
}: {
  hero: DesktopReviewData["hero"];
  onSkip?: () => void;
  onShortlist?: () => void;
  onUndo?: () => void;
  onOpenDetail?: () => void;
  onLightboxOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  pendingAction?: DesktopReviewPendingAction;
}) {
  return (
    <section className="flex min-h-0 w-[540px] flex-1 shrink-0 flex-col gap-3.5">
      <article className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <HeroPhoto
          onLightboxOpenChange={onLightboxOpenChange}
          photos={hero.photos}
        />
        <div className="flex shrink-0 flex-col gap-4 px-7 pt-6">
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
        <HeroActions
          disabled={disabled}
          onOpenDetail={onOpenDetail}
          onShortlist={onShortlist}
          onSkip={onSkip}
          onUndo={onUndo}
          pendingAction={pendingAction}
        />
      </article>
    </section>
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
  const [index, setIndex] = useState(0);

  // Keep our progress + counter overlays in sync with whatever slide
  // Embla settles on (drag, click, keyboard, programmatic).
  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const sync = () => setIndex(emblaApi.selectedScrollSnap());
    sync();
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  // New card → snap back to the first photo without animation. `photos`
  // is the trigger: when a new card arrives, the array identity changes
  // and we re-snap to slide 0. It isn't referenced inside the body.
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
  // ←/→ cycle the hero photos when the lightbox isn't already steering the
  // arrow keys. `canPaginate` covers the single-photo edge case.
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

  // Mirror the lightbox state up so the route can disable its page-level
  // keep/skip/shortlist/undo hotkeys while the lightbox is steering the
  // keyboard (otherwise ArrowRight would advance the photo AND keep the card).
  useEffect(() => {
    onLightboxOpenChange?.(lightboxOpen);
  }, [lightboxOpen, onLightboxOpenChange]);

  if (photoCount === 0) {
    return (
      <div className="relative flex min-h-[280px] w-full flex-1 items-center justify-center bg-muted">
        <span className="text-muted-foreground text-xs">No photos</span>
      </div>
    );
  }

  return (
    <div className="group relative min-h-[280px] w-full flex-1 select-none">
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
                src={src}
              />
            </button>
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/45 to-transparent"
      />
      {canPaginate ? (
        <>
          <button
            aria-label="Previous photo"
            className="-translate-y-1/2 absolute top-1/2 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            onClick={scrollPrev}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
          </button>
          <button
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
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
      <span className="pointer-events-none absolute top-3.5 right-3.5 rounded-full bg-black/55 px-2.5 py-1 font-semibold text-[11px] text-white">
        {index + 1} / {photoCount}
      </span>
      {canPaginate ? (
        <div className="absolute right-0 bottom-3.5 left-0 flex items-center justify-center gap-1.5">
          {photos.map((src, i) => (
            <button
              aria-label={`Go to photo ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/45 hover:bg-white/70"
              )}
              key={`dot-${src}-${i}`}
              onClick={() => scrollTo(i)}
              type="button"
            />
          ))}
        </div>
      ) : null}
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
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const sync = () => setIndex(emblaApi.selectedScrollSnap());
    sync();
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  // Re-sync the carousel position when the lightbox opens to whatever
  // slide the small carousel is currently showing. Embla's `startIndex`
  // only applies on first mount.
  useEffect(() => {
    if (open && emblaApi) {
      emblaApi.scrollTo(startIndex, true);
    }
  }, [open, emblaApi, startIndex]);

  // ArrowLeft / ArrowRight scroll the embla carousel while the lightbox is
  // open. Mutually exclusive with HeroPhoto's same-key registrations (which
  // gate on `!lightboxOpen`), so only one handler fires at a time. No
  // `description` here — the help dialog's "Previous/Next photo" entry
  // already covers both contexts; listing them twice would just confuse.
  // Esc is handled by base-ui Dialog.
  useHotkey("ArrowLeft", () => emblaApi?.scrollPrev(), { enabled: open });
  useHotkey("ArrowRight", () => emblaApi?.scrollNext(), { enabled: open });

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
                className="-translate-y-1/2 absolute top-1/2 left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
                onClick={() => emblaApi?.scrollPrev()}
                type="button"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={20}
                  strokeWidth={2}
                />
              </button>
              <button
                aria-label="Next photo"
                className="-translate-y-1/2 absolute top-1/2 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
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
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
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
        <Eyebrow tone="primary">Floor plan read</Eyebrow>
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
  // Tints derived from each tone's accent colour so the pill keeps its
  // hue distinction in light mode AND stays legible in dark mode — the
  // 15% alpha means the same class reads as a subtle warm wash over
  // either page background, and `text-foreground` always inverts.
  const palette =
    tone === "positive"
      ? "bg-[#5D7A4A]/15 text-foreground"
      : "bg-[#B26B3F]/15 text-foreground";
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

function HeroActions({
  onSkip,
  onShortlist,
  onUndo,
  onOpenDetail,
  disabled,
  pendingAction,
}: {
  onSkip?: () => void;
  onShortlist?: () => void;
  onUndo?: () => void;
  onOpenDetail?: () => void;
  disabled?: boolean;
  pendingAction?: DesktopReviewPendingAction;
}) {
  return (
    <div className="mt-4 flex shrink-0 flex-col gap-2.5 border-bone border-t px-7 pt-3 pb-6">
      <HeroActionHints />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ActionButton
            disabled={disabled}
            hint="Z"
            icon={ArrowReloadHorizontalIcon}
            label="Undo"
            loading={pendingAction === "undo"}
            onClick={onUndo}
          />
          <ActionButton
            disabled={disabled}
            hint="S"
            icon={Cancel01Icon}
            label="Skip"
            loading={pendingAction === "skip"}
            onClick={onSkip}
          />
          <ActionButton
            disabled={disabled}
            hint="I"
            icon={InformationCircleIcon}
            label="Details"
            onClick={onOpenDetail}
          />
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            disabled={disabled}
            hint="L"
            icon={FavouriteIcon}
            label="Shortlist"
            loading={pendingAction === "shortlist"}
            onClick={onShortlist}
            variant="primary"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Thin strip above the action button row that surfaces the keyboard
 * shortcuts that *don't* have buttons of their own — arrow keys for
 * photos / queue navigation and `?` for the help dialog. Kept subtle
 * so it reads as a tip, not a control.
 */
function HeroActionHints() {
  return (
    <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>photos</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <span>queue</span>
        </span>
      </div>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>?</Kbd>
        <span>shortcuts</span>
      </span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  variant = "ghost",
  onClick,
  disabled,
  loading = false,
}: {
  icon: typeof FavouriteIcon;
  label: string;
  hint: string;
  variant?: "ghost" | "primary";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      aria-busy={loading || undefined}
      aria-label={label}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full pr-2 pl-3.5 font-medium text-sm transition-opacity",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-[0_6px_18px_rgba(155,90,62,0.28)]"
          : "border border-border bg-card text-foreground",
        (!onClick || disabled) && "cursor-not-allowed opacity-40",
        onClick && !disabled && "hover:opacity-90 active:scale-[0.98]"
      )}
      disabled={!onClick || disabled}
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon
        className={loading ? "animate-spin" : undefined}
        icon={loading ? Loading03Icon : icon}
        size={16}
        strokeWidth={1.8}
      />
      <span>{label}</span>
      <Kbd
        className={cn(
          "ml-1 h-6 min-w-6 rounded-md px-1.5 font-mono font-semibold text-[10px] uppercase",
          variant === "primary" &&
            "bg-primary-foreground/15 text-primary-foreground"
        )}
      >
        {hint}
      </Kbd>
    </button>
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
  searchOptions: [{ id: "north-london", name: "North London · 2-bed" }],
  selectedSearchId: null,
  reviewedToday: 5,
  keptToday: 1,
  skippedToday: 4,
  leftToday: 18,
  queue: {
    remaining: 6,
    selectedClusterId: "belsize",
    items: [
      {
        id: "belsize",
        title: "Belsize Park Mews",
        outcode: "NW3",
        beds: 2,
        price: "£2,450",
        photo: PHOTO_HERO,
      },
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
    photos: [PHOTO_HERO, PHOTO_BEDROOM, PHOTO_COOKING],
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
};
