/**
 * Desktop Listing detail — two-column workspace shown above the `md`
 * breakpoint. Mirrors the `Desktop · Listing detail` artboard:
 *
 *   - TOP    : back arrow, breadcrumb (Review / search / listing), and
 *              Save PDF / Share / Open on portal actions.
 *   - LEFT   : hero photo (with cluster + photo counter overlays), 5-up
 *              photo strip, floor-plan card with room annotations, and a
 *              location card with mini-map + commute pills.
 *   - RIGHT  : price + portals cluster card, AI "small print" signals,
 *              public records grid, sticky decision bar pinned at the
 *              bottom.
 *
 * Renders nothing below `md` so the existing mobile shell stays
 * untouched on small viewports.
 */
import {
  AiMagicIcon,
  Alert01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FavouriteIcon,
  FitToScreenIcon,
  LinkSquare01Icon,
  Loading03Icon,
  MinusSignIcon,
  PlusSignIcon,
  Share05Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import useEmblaCarousel from "embla-carousel-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  type ListingFromOrigin,
  resolveFromOrigin,
} from "../../lib/listing-origin";
import { cn } from "../../lib/utils";
import type {
  ListingDetailHighlight,
  ListingDetailPayload,
  ListingDetailPortalRow,
  ListingDetailPublicRecords,
  ListingDetailWatchout,
} from "../../server/functions/listing-detail";
import { AdminSidebar } from "../layout/admin-sidebar";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";

type Outcome = "keep" | "skip" | "shortlist";

/**
 * Which swipe action is currently mid-flight. Drives the per-button
 * spinner in {@link DecisionBar}. `null` means nothing is pending.
 */
export type ListingDetailPendingAction = Outcome | null;

type Props = {
  data: ListingDetailPayload;
  disabled?: boolean;
  from?: ListingFromOrigin;
  onShortlist: () => void;
  pendingAction?: ListingDetailPendingAction;
};

export function DesktopListingDetail({
  data,
  disabled,
  from,
  onShortlist,
  pendingAction = null,
}: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <TopBar
        disabled={disabled}
        from={from}
        headline={data.headline}
        mySwipe={data.mySwipe}
        onShortlist={onShortlist}
        partnerNames={data.partnerSwipes
          .filter((s) => s.outcome === null)
          .map((s) => s.name)}
        pendingAction={pendingAction}
      />
      <div className="flex min-w-0 flex-1 gap-6 px-10 pt-6 pb-8">
        <MediaColumn data={data} />
        <InfoColumn data={data} />
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar({
  from,
  headline,
  mySwipe,
  disabled,
  pendingAction,
  partnerNames,
  onShortlist,
}: {
  from?: ListingFromOrigin;
  headline: ListingDetailPayload["headline"];
  mySwipe?: Outcome;
  disabled?: boolean;
  pendingAction?: ListingDetailPendingAction;
  partnerNames: string[];
  onShortlist: () => void;
}) {
  const navigate = useNavigate();
  const title = shortAddressTitle(headline.addressRaw);
  const origin = resolveFromOrigin(from);
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-bone border-b bg-ground/85 px-10 py-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3.5">
        <button
          aria-label="Back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground"
          onClick={() => {
            // Prefer real history.back so the prior page's scroll +
            // selection state is restored; fall back to the recorded
            // origin so deep-linked / refreshed loads still go somewhere
            // sensible.
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              navigate({ to: origin.path });
            }
          }}
          type="button"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </button>
        <nav
          aria-label="breadcrumb"
          className="flex min-w-0 items-center gap-2 text-xs"
        >
          <Link
            className="shrink-0 text-muted-foreground hover:text-foreground"
            to={origin.path}
          >
            {origin.label}
          </Link>
          <span className="text-[#B5A893]">/</span>
          <span className="truncate font-semibold text-foreground">
            {title}
          </span>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <button
          aria-label="Share with household"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator
                .share({ title: headline.addressRaw, url: headline.url })
                .catch(() => {
                  // user cancelled
                });
            }
          }}
          type="button"
        >
          <HugeiconsIcon icon={Share05Icon} size={14} strokeWidth={1.6} />
        </button>
        <a
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-foreground text-xs"
          href={headline.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          <HugeiconsIcon icon={LinkSquare01Icon} size={14} strokeWidth={1.6} />
          <span className="font-semibold">
            Open on {portalLabel(headline.portal)}
          </span>
        </a>
        <ShortlistButton
          disabled={disabled}
          mySwipe={mySwipe}
          onShortlist={onShortlist}
          partnerNames={partnerNames}
          pendingAction={pendingAction}
        />
      </div>
    </header>
  );
}

/**
 * Header-styled primary action button. Replaces the v1 sticky-footer
 * DecisionBar with a single button whose label encodes the household
 * decision state (Shortlist · Shortlisted · Waiting on Alice · …).
 *
 * Visual contract: same h-9 / rounded-lg as the surrounding header
 * controls so the row reads as a single button cluster.
 */
function ShortlistButton({
  disabled,
  mySwipe,
  pendingAction,
  partnerNames,
  onShortlist,
}: {
  disabled?: boolean;
  mySwipe?: Outcome;
  pendingAction?: ListingDetailPendingAction;
  partnerNames: string[];
  onShortlist: () => void;
}) {
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  const label = shortlistLabel(mySwipe, partnerNames);
  return (
    <button
      aria-busy={pendingAction === "shortlist" || undefined}
      aria-pressed={iKept}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-semibold text-xs disabled:opacity-50",
        iKept ? "bg-bone text-primary" : "bg-primary text-bone"
      )}
      disabled={disabled}
      onClick={onShortlist}
      type="button"
    >
      <HugeiconsIcon
        className={pendingAction === "shortlist" ? "animate-spin" : undefined}
        icon={pendingAction === "shortlist" ? Loading03Icon : FavouriteIcon}
        size={14}
        strokeWidth={1.8}
      />
      <span>{label}</span>
    </button>
  );
}

/**
 * Header-button label for the Shortlist control. Stays short enough to
 * fit inline (no full sentence) while still encoding the household
 * decision state.
 */
function shortlistLabel(
  mySwipe: Outcome | undefined,
  partnerNames: string[]
): string {
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  if (!iKept) {
    return "Shortlist";
  }
  if (partnerNames.length === 0) {
    return "Shortlisted";
  }
  const first = partnerNames[0] ?? "them";
  const rest = partnerNames.length - 1;
  return rest > 0 ? `Waiting on ${first} +${rest}` : `Waiting on ${first}`;
}

/* ---------------- Media column ---------------- */

function MediaColumn({ data }: { data: ListingDetailPayload }) {
  const { photos, headline, floorplan, commuteMinutes, fineprint } = data;
  const photoCount = Math.max(photos.length, 1);

  const canPaginate = photos.length > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: 28,
    watchDrag: canPaginate,
  });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) {
      return;
    }
    const sync = () => setActiveIndex(emblaApi.selectedScrollSnap());
    sync();
    emblaApi.on("select", sync);
    emblaApi.on("reInit", sync);
    return () => {
      emblaApi.off("select", sync);
      emblaApi.off("reInit", sync);
    };
  }, [emblaApi]);

  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <section className="flex w-[720px] shrink-0 flex-col gap-3.5">
      <HeroPhoto
        activeIndex={activeIndex}
        alt={headline.addressRaw}
        canPaginate={canPaginate}
        emblaRef={emblaRef}
        onNext={scrollNext}
        onPrev={scrollPrev}
        photoCount={photoCount}
        photos={photos}
      />
      {photos.length > 1 ? (
        <PhotoStrip
          activeIndex={activeIndex}
          onSelect={scrollTo}
          photos={photos}
        />
      ) : null}
      <FloorplanCard
        floorplanUrl={floorplan?.url}
        sizeSqFt={fineprint.sizeSqFt}
      />
      <LocationCard
        apiKey={data.googleMapsApiKey}
        commuteMinutes={commuteMinutes}
        lat={data.cluster.lat}
        lng={data.cluster.lng}
        postcode={headline.postcode ?? data.cluster.postcode}
      />
    </section>
  );
}

function HeroPhoto({
  photos,
  photoCount,
  alt,
  emblaRef,
  activeIndex,
  canPaginate,
  onPrev,
  onNext,
}: {
  photos: ListingDetailPayload["photos"];
  photoCount: number;
  alt: string;
  emblaRef: ReturnType<typeof useEmblaCarousel>[0];
  activeIndex: number;
  canPaginate: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="relative h-[400px] w-full overflow-hidden rounded-2xl bg-muted">
        <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
          No photo yet
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent"
        />
      </div>
    );
  }

  return (
    <div className="group relative h-[400px] w-full select-none overflow-hidden rounded-2xl bg-muted">
      <div className="h-full w-full overflow-hidden" ref={emblaRef}>
        <div className="flex h-full touch-pan-y">
          {photos.map((p, i) => (
            <div
              className="relative h-full min-w-0 flex-[0_0_100%]"
              key={p.url || `hero-${i}`}
            >
              {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
              <img
                alt={alt}
                className="h-full w-full object-cover"
                draggable={false}
                src={p.url}
              />
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent"
      />
      {canPaginate ? (
        <>
          <button
            aria-label="Previous photo"
            className="-translate-y-1/2 absolute top-1/2 left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            onClick={onPrev}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} strokeWidth={2} />
          </button>
          <button
            aria-label="Next photo"
            className="-translate-y-1/2 absolute top-1/2 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            onClick={onNext}
            type="button"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} strokeWidth={2} />
          </button>
        </>
      ) : null}
      <span className="pointer-events-none absolute top-5 right-5 rounded-full bg-black/70 px-3 py-1.5 font-semibold text-[11px] text-white">
        {activeIndex + 1} / {photoCount}
      </span>
      <span className="pointer-events-none absolute right-5 bottom-5 inline-flex items-center gap-1.5 rounded-full bg-foreground/85 px-3.5 py-2 font-semibold text-[12px] text-white">
        View all {photoCount} photos
      </span>
    </div>
  );
}

function PhotoStrip({
  photos,
  activeIndex,
  onSelect,
}: {
  photos: ListingDetailPayload["photos"];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  // The strip is its own Embla carousel. Each thumbnail is a slide and
  // the strip pans so the active photo sits at the left edge — matches
  // the hero. `containScroll` stops the rail from over-scrolling past
  // the last group.
  const [stripRef, stripApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    duration: 22,
  });

  // Slide the strip whenever the hero changes (drag, click, thumb).
  useEffect(() => {
    if (!stripApi) {
      return;
    }
    stripApi.scrollTo(activeIndex);
  }, [stripApi, activeIndex]);

  return (
    // -mx/-my keep the strip visually flush with the hero above; the
    // inner padding gives the active thumb's ring + ring-offset enough
    // room not to be clipped by the embla viewport's overflow-hidden.
    <div className="-mx-1.5 -my-1.5 overflow-hidden p-1.5" ref={stripRef}>
      <div className="flex touch-pan-y gap-2.5">
        {photos.map((p, i) => {
          const active = i === activeIndex;
          return (
            // biome-ignore lint/nursery/useAriaPropsSupportedByRole: aria-current is a global ARIA attribute and is valid on buttons used as photo-strip items.
            <button
              aria-current={active ? "true" : undefined}
              aria-label={`Show photo ${i + 1}`}
              className={cn(
                "relative h-[90px] flex-[0_0_136px] overflow-hidden rounded-xl bg-muted ring-2 ring-transparent ring-offset-2 ring-offset-ground transition-[opacity,ring,filter]",
                active
                  ? "ring-primary"
                  : "opacity-80 hover:opacity-100 hover:ring-border"
              )}
              key={p.url || `strip-${i}`}
              onClick={() => onSelect(i)}
              type="button"
            >
              {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                src={p.url}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FloorplanCard({
  sizeSqFt,
  floorplanUrl,
}: {
  sizeSqFt?: number | null;
  floorplanUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-end justify-between px-6 pt-5 pb-3.5">
        <div className="flex flex-col gap-1">
          <Eyebrow tone="primary">Floor plan</Eyebrow>
          <h2 className="font-serif text-[22px] text-foreground">
            How it lays out
          </h2>
        </div>
        {sizeSqFt ? (
          <span className="inline-flex items-center rounded-full bg-bone px-2.5 py-1.5 font-semibold text-[11px] text-primary">
            {sizeSqFt.toLocaleString("en-GB")} sq ft
          </span>
        ) : null}
      </header>
      <div className="mx-6 mb-6 flex h-[280px] items-center justify-center overflow-hidden rounded-xl border border-bone bg-[#FBF6EA]">
        {floorplanUrl ? (
          <button
            aria-label="Expand floor plan"
            className="group flex h-full w-full cursor-zoom-in items-center justify-center"
            onClick={() => setOpen(true)}
            type="button"
          >
            {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
            <img
              alt="Floor plan"
              className="max-h-full max-w-full object-contain transition-transform group-hover:scale-[1.01]"
              draggable={false}
              src={floorplanUrl}
            />
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">
            No floor plan attached to this listing.
          </p>
        )}
      </div>
      {floorplanUrl ? (
        <FloorplanLightbox
          onOpenChange={setOpen}
          open={open}
          url={floorplanUrl}
        />
      ) : null}
    </article>
  );
}

function FloorplanLightbox({
  open,
  onOpenChange,
  url,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="grid h-[95vh] w-[95vw] max-w-none place-items-stretch gap-0 overflow-hidden border-0 bg-[#FBF6EA] p-0 ring-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Floor plan</DialogTitle>
        <div className="relative h-full w-full">
          <TransformWrapper
            centerOnInit
            doubleClick={{ mode: "toggle", step: 1.2 }}
            initialScale={1}
            limitToBounds={false}
            maxScale={6}
            minScale={1}
            pinch={{ step: 5 }}
            wheel={{ step: 0.2 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <TransformComponent
                  contentClass="!flex items-center justify-center"
                  wrapperClass="!h-full !w-full"
                  wrapperStyle={{ height: "100%", width: "100%" }}
                >
                  {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
                  <img
                    alt="Floor plan"
                    className="max-h-[95vh] max-w-[95vw] object-contain"
                    draggable={false}
                    src={url}
                  />
                </TransformComponent>
                <div className="-translate-x-1/2 absolute bottom-5 left-1/2 flex items-center gap-1 rounded-full bg-foreground/85 p-1 text-white shadow-lg">
                  <ZoomButton
                    icon={MinusSignIcon}
                    label="Zoom out"
                    onClick={() => zoomOut()}
                  />
                  <ZoomButton
                    icon={FitToScreenIcon}
                    label="Fit to screen"
                    onClick={() => resetTransform()}
                  />
                  <ZoomButton
                    icon={PlusSignIcon}
                    label="Zoom in"
                    onClick={() => zoomIn()}
                  />
                </div>
              </>
            )}
          </TransformWrapper>
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/85 text-white transition-colors hover:bg-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ZoomButton({
  icon,
  label,
  onClick,
}: {
  icon: typeof PlusSignIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
    </button>
  );
}

function LocationCard({
  postcode,
  commuteMinutes,
  lat,
  lng,
  apiKey,
}: {
  postcode: string | null;
  commuteMinutes?: Record<string, number>;
  lat: string | null;
  lng: string | null;
  apiKey: string;
}) {
  const firstTarget = commuteMinutes
    ? Object.entries(commuteMinutes)[0]
    : undefined;
  const title = postcode ? `London ${postcode.toUpperCase()}` : "Where it sits";
  const latNum = lat ? Number(lat) : null;
  const lngNum = lng ? Number(lng) : null;
  const hasCoords =
    latNum !== null &&
    lngNum !== null &&
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum);
  const mapSrc =
    hasCoords && apiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${latNum},${lngNum}&zoom=15`
      : null;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex items-end justify-between px-6 pt-5 pb-3.5">
        <div className="flex flex-col gap-1">
          <Eyebrow>Where it sits</Eyebrow>
          <h2 className="font-serif text-[22px] text-foreground">{title}</h2>
        </div>
        {firstTarget ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-bone px-3 py-1.5">
            <span className="font-semibold text-[11px] text-primary">
              {firstTarget[0]}
            </span>
            <span className="font-semibold text-[11px] text-foreground">
              {firstTarget[1]} min
            </span>
          </span>
        ) : null}
      </header>
      <div className="mx-6 mb-6 h-[220px] overflow-hidden rounded-xl border border-bone bg-[#F3EBDC]">
        {mapSrc ? (
          <iframe
            allowFullScreen={false}
            className="h-full w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={mapSrc}
            title={title}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-muted-foreground text-sm">Location pending</p>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------------- Info column ---------------- */

function InfoColumn({ data }: { data: ListingDetailPayload }) {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3.5">
      <PriceCard data={data} />
      <AiCard
        highlights={data.highlights}
        summary={data.summary}
        watchouts={data.watchouts}
      />
      <RecordsCard epc={data.epc} publicRecords={data.publicRecords} />
    </section>
  );
}

function PriceCard({ data }: { data: ListingDetailPayload }) {
  const { headline, portalSpread, cluster } = data;
  const title = shortAddressTitle(headline.addressRaw);
  const subtitle = subtitleFor(headline.postcode, cluster.postcode);
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-[38px] text-foreground leading-none tracking-tight">
              {formatPrice(headline.priceMonthly)}
            </span>
            <span className="text-[13px] text-muted-foreground">/mo</span>
          </div>
          <Eyebrow>
            {listedAgoLabel(headline.firstSeenAt)} · {portalSpread.length}{" "}
            portal{portalSpread.length === 1 ? "" : "s"} tracking
          </Eyebrow>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-serif text-[22px] text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-col border-bone border-t pt-3.5">
        {portalSpread.map((row, i) => (
          <PortalRow
            isLast={i === portalSpread.length - 1}
            key={`${row.portal}-${row.url}`}
            row={row}
          />
        ))}
      </div>
    </article>
  );
}

function PortalRow({
  row,
  isLast,
}: {
  row: ListingDetailPortalRow;
  isLast: boolean;
}) {
  const delta = row.deltaFromHeadline ?? 0;
  return (
    <a
      className={cn(
        "-mx-2 flex min-w-0 items-center gap-3 px-2 py-2.5 transition-colors hover:bg-ground",
        !isLast && "border-border border-b"
      )}
      href={row.url}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bone font-semibold font-serif text-[13px] text-primary">
        {portalLabel(row.portal).charAt(0)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[13px] text-foreground">
          {portalLabel(row.portal)}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {row.agentName ?? "Direct from landlord"}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-medium font-serif text-[15px] text-foreground">
          {formatPrice(row.priceMonthly)}
        </span>
        {delta > 0 ? (
          <span className="font-semibold text-[#B26B3F] text-[10px]">
            +{formatPrice(delta)}
          </span>
        ) : null}
      </div>
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={LinkSquare01Icon}
        size={14}
        strokeWidth={1.8}
      />
    </a>
  );
}

function AiCard({
  highlights,
  watchouts,
  summary,
}: {
  highlights: ListingDetailHighlight[];
  watchouts: ListingDetailWatchout[];
  summary: string | null;
}) {
  if (highlights.length === 0 && watchouts.length === 0 && !summary) {
    return null;
  }
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-6 py-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <HugeiconsIcon
            className="text-primary"
            icon={AiMagicIcon}
            size={12}
            strokeWidth={2}
          />
          <Eyebrow tone="primary">Description read</Eyebrow>
        </div>
        <h2 className="font-serif text-[20px] text-foreground">
          What stands out
        </h2>
      </header>
      {summary ? (
        <p className="text-[13px] text-muted-foreground leading-[145%]">
          {summary}
        </p>
      ) : null}
      {highlights.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {highlights.map((item, idx) => (
            <HighlightRow item={item} key={`h:${item.label}:${idx}`} />
          ))}
        </ul>
      ) : null}
      {watchouts.length > 0 ? (
        <ul className="flex flex-col gap-3 border-bone border-t pt-3.5">
          {watchouts.map((item, idx) => (
            <WatchoutRow item={item} key={`w:${item.label}:${idx}`} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function HighlightRow({ item }: { item: ListingDetailHighlight }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E3EBD7]">
        <HugeiconsIcon
          className="text-[#5D7A4A]"
          icon={Tick01Icon}
          size={10}
          strokeWidth={2.2}
        />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-[13px] text-foreground">
          {item.label}
        </p>
        {item.detail ? (
          <p className="text-[12px] text-muted-foreground leading-4">
            {item.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function WatchoutRow({ item }: { item: ListingDetailWatchout }) {
  const isProblem = item.severity === "problem";
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
          isProblem ? "bg-destructive/15" : "bg-[#FBEDDC]"
        )}
      >
        <HugeiconsIcon
          className={isProblem ? "text-destructive" : "text-[#B26B3F]"}
          icon={Alert01Icon}
          size={10}
          strokeWidth={2.2}
        />
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-[13px] text-foreground">
          {item.label}
        </p>
        {item.detail ? (
          <p className="text-[12px] text-muted-foreground leading-4">
            {item.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function RecordsCard({
  epc,
  publicRecords,
}: {
  epc?: ListingDetailPayload["epc"];
  publicRecords?: ListingDetailPublicRecords;
}) {
  const rows = buildRecordRows(epc, publicRecords);
  if (rows.length === 0) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-6 py-5">
      <header className="flex flex-col gap-1">
        <Eyebrow>The boring numbers</Eyebrow>
        <h2 className="font-serif text-[20px] text-foreground">
          Public records
        </h2>
      </header>
      <ul className="flex flex-col">
        {rows.map((row, i) => (
          <li
            className={cn(
              "flex items-center justify-between py-3",
              i < rows.length - 1 && "border-[#F2EBDE] border-b"
            )}
            key={row.label}
          >
            <span className="text-[13px] text-foreground">{row.label}</span>
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-medium font-serif text-[16px] text-foreground">
                {row.value}
              </span>
              {row.meta ? (
                <span className="text-[10px] text-muted-foreground">
                  {row.meta}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

/* ---------------- Atoms + helpers ---------------- */

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

function formatPrice(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `£${value.toLocaleString("en-GB")}`;
}

function listedAgoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "Listed today";
  }
  if (days === 1) {
    return "Listed yesterday";
  }
  if (days < 7) {
    return `Listed ${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  return `Listed ${weeks} week${weeks === 1 ? "" : "s"} ago`;
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

function subtitleFor(
  headlinePostcode: string | null,
  clusterPostcode: string | null
): string {
  if (headlinePostcode) {
    return `London ${headlinePostcode.toUpperCase()}`;
  }
  if (clusterPostcode) {
    return `London ${clusterPostcode.toUpperCase()}`;
  }
  return "";
}

type RecordRow = { label: string; value: string; meta?: string };

function buildRecordRows(
  epc: ListingDetailPayload["epc"],
  publicRecords?: ListingDetailPublicRecords
): RecordRow[] {
  const rows: RecordRow[] = [];
  const epcRow = epcRecordRow(epc);
  if (epcRow) {
    rows.push(epcRow);
  }
  const broadband = broadbandRecordRow(publicRecords?.broadband);
  if (broadband) {
    rows.push(broadband);
  }
  const crimeRow = crimeRecordRow(publicRecords?.crime);
  if (crimeRow) {
    rows.push(crimeRow);
  }
  const flood = floodRecordRow(publicRecords?.flood);
  if (flood) {
    rows.push(flood);
  }
  const amenities = amenitiesRecordRow(publicRecords?.amenities);
  if (amenities) {
    rows.push(amenities);
  }
  return rows;
}

function epcRecordRow(epc: ListingDetailPayload["epc"]): RecordRow | null {
  if (!epc) {
    return null;
  }
  return {
    label: "EPC rating",
    value: epc.rating,
    meta: epc.potential ? `Potential ${epc.potential}` : undefined,
  };
}

function broadbandRecordRow(
  bb: ListingDetailPublicRecords["broadband"]
): RecordRow | null {
  if (!bb) {
    return null;
  }
  const tech = bb.technology ?? "Unknown";
  const speed = bb.downloadMbps ? `${bb.downloadMbps} Mbps` : "Speed pending";
  return {
    label: "Broadband",
    value: `${tech} · ${speed}`,
    meta: bb.fttpAvailable ? "Full-fibre available" : undefined,
  };
}

function crimeRecordRow(
  crime: ListingDetailPublicRecords["crime"]
): RecordRow | null {
  if (!crime) {
    return null;
  }
  const meta = crime.topCategory
    ? `${humaniseCategory(crime.topCategory.category)} · ${crime.topCategory.count}`
    : undefined;
  return {
    label: `Crime · ${crime.month}`,
    value: `${crime.total} in 1mi`,
    meta,
  };
}

function floodRecordRow(
  flood: ListingDetailPublicRecords["flood"]
): RecordRow | null {
  if (!flood) {
    return null;
  }
  const value = flood.riskLevel
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return { label: "Flood risk", value, meta: "Environment Agency" };
}

function amenitiesRecordRow(
  amenities: ListingDetailPublicRecords["amenities"]
): RecordRow | null {
  if (!amenities) {
    return null;
  }
  const total = Object.values(amenities.counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return null;
  }
  const top = Object.entries(amenities.counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${humaniseCategory(k)} ${v}`)
    .join(" · ");
  return {
    label: "Amenities nearby",
    value: `${total} within ${Math.round(amenities.withinMeters)}m`,
    meta: top || undefined,
  };
}

const DLD_CATEGORY_LABELS: Record<string, string> = {
  cafe: "Cafés",
  restaurant: "Restaurants",
  pub: "Pubs",
  bar: "Bars",
  gym: "Gyms",
  fitness_centre: "Gyms",
  school: "Schools",
  supermarket: "Supermarkets",
  pharmacy: "Pharmacies",
  doctors: "GPs",
  hospital: "Hospitals",
  park: "Parks",
  bus_stop: "Bus stops",
  station: "Stations",
  bicycle_parking: "Bike parking",
};

function humaniseCategory(key: string): string {
  if (DLD_CATEGORY_LABELS[key]) {
    return DLD_CATEGORY_LABELS[key];
  }
  return key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

