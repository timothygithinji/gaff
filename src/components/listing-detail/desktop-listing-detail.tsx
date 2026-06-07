/**
 * Desktop Listing detail — shown above the `lg` breakpoint under the
 * shared top-nav shell (`AdminSidebar`). Mirrors Paper "Listing detail ·
 * Desktop" (2Z8-0) and "· Laptop" (48S-0):
 *
 *   - TOP    : breadcrumb (Review / area / listing).
 *   - HERO   : a wide main photo (≈1.6fr) + a 2×2 thumbnail grid (1fr),
 *              "View all N photos" tag bottom-left of the main photo.
 *   - BODY   : two columns — MAIN (title block, highlights card, small-
 *              print card, map+commute card) + a 360px SIDE RAIL (price
 *              card with portal spread + decision actions, public-records
 *              card, household-activity card).
 *
 * Renders nothing below `lg` so the mobile shell stays untouched.
 * All colours come from the maritime tokens; fixed-navy surfaces pin
 * literal hex so they don't flip in the dark scene.
 */
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FavouriteIcon,
  File01Icon,
  FitToScreenIcon,
  LinkSquare01Icon,
  Loading03Icon,
  MapsLocation01Icon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
import { useEmblaWheelGestures } from "../../hooks/use-embla-wheel-gestures";
import {
  type ListingFromOrigin,
  resolveFromOrigin,
} from "../../lib/listing-origin";
import { outcodeLocationLabel } from "../../lib/outcode-areas";
import { sizedPhoto } from "../../lib/photo-size";
import { propertyKindLabel } from "../../lib/property-kind";
import { cn } from "../../lib/utils";
import type {
  ListingDetailHighlight,
  ListingDetailPayload,
  ListingDetailPhoto,
  ListingDetailPublicRecords,
  ListingDetailWatchout,
} from "../../server/functions/listing-detail";
import { AdminSidebar } from "../layout/admin-sidebar";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import {
  FeatureList,
  highlightsToPills,
  watchoutsToPills,
} from "../ui/patterns/feature-pills";
import { PortalList, toPortalRows } from "../ui/patterns/portal-list";
import { PriceBlock } from "../ui/patterns/price-block";
import { ActivityCard } from "./activity";
import { CostsCard } from "./costs";
import { FineprintCard } from "./fineprint";
import { GalleryLightbox } from "./gallery-lightbox";
import { MapCommute } from "./map-commute";
import { PropertyFactsCard } from "./property-facts";

type Outcome = "keep" | "skip" | "shortlist";

/** Which swipe action is mid-flight. `null` means nothing is pending. */
export type ListingDetailPendingAction = Outcome | null;

type Props = {
  data: ListingDetailPayload;
  disabled?: boolean;
  from?: ListingFromOrigin;
  onShortlist: () => void;
  /** Veto (skip) this listing — shown alongside Keep until it's reviewed. */
  onSkip?: () => void;
  /** Open the manual address-override dialog (owned by the route). */
  onEditAddress?: () => void;
  pendingAction?: ListingDetailPendingAction;
};

export function DesktopListingDetail({
  data,
  disabled,
  from,
  onShortlist,
  onSkip,
  onEditAddress,
  pendingAction = null,
}: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <div className="flex w-full flex-col px-10 pt-6">
        <BackButton clusterId={data.cluster.id} from={from} />
        <HeroGallery data={data} />
        <ListingTitle data={data} />
        <div className="flex gap-6 pt-[18px] pb-10">
          <MainColumn data={data} />
          <SideRail
            data={data}
            disabled={disabled}
            onEditAddress={onEditAddress}
            onShortlist={onShortlist}
            onSkip={onSkip}
            pendingAction={pendingAction}
          />
        </div>
      </div>
    </AdminSidebar>
  );
}

/* ---------------- Back button ---------------- */

function BackButton({
  from,
  clusterId,
}: {
  from?: ListingFromOrigin;
  clusterId: string;
}) {
  const navigate = useNavigate();
  const origin = resolveFromOrigin(from);
  const onBack = () => {
    // Real back-nav is best: scrollRestoration returns review/shortlist to the
    // exact spot — the cluster the user was on — and keeps the search filter.
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    // No history (deep link / refresh on the detail page): synthesise a landing
    // that still lands on this cluster. Review focuses it via `?clusterId` (the
    // queue scrolls the selected card into view); other sections don't take a
    // focus param, so fall back to their root.
    if (origin.path === "/") {
      navigate({ to: "/", search: { clusterId } });
      return;
    }
    navigate({ to: origin.path });
  };
  return (
    <Button
      className="my-1 self-start hover:bg-mist hover:text-foreground"
      onClick={onBack}
      size="sm"
      variant="outline"
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
      Back to {origin.label}
    </Button>
  );
}

/* ---------------- Hero gallery ---------------- */

function HeroGallery({ data }: { data: ListingDetailPayload }) {
  const { photos, headline } = data;
  const photoCount = Math.max(photos.length, 1);
  const canPaginate = photos.length > 1;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "start",
    duration: 28,
    watchDrag: canPaginate,
  });
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const selectedIndex = useEmblaSelectedIndex(emblaApi);
  useEmblaWheelGestures(emblaApi);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStart, setLightboxStart] = useState(0);
  const openLightbox = useCallback((i: number) => {
    setLightboxStart(i);
    setLightboxOpen(true);
  }, []);
  // The 2×2 grid is a sliding window of the photos *following* whatever the
  // hero is currently showing — so it advances as you navigate the carousel
  // (and never repeats the photo already on the big stage).
  const gridCount = Math.min(4, Math.max(photos.length - 1, 0));
  const grid: { photo: ListingDetailPhoto; index: number }[] = [];
  for (let i = 0; i < gridCount; i++) {
    const index = (selectedIndex + 1 + i) % photos.length;
    const photo = photos[index];
    if (photo) {
      grid.push({ photo, index });
    }
  }

  // Row aspect 13/6 (~2.17) puts the main photo — 1.6 of the 2.6-unit row —
  // at 4:3, the ratio Rightmove/OpenRent serve and the property-photo
  // standard, so the hero crops next to nothing. max-h keeps it from
  // dominating on ultrawide (ratio widens slightly past the cap).
  return (
    <div className="mt-[18px] flex aspect-[13/6] max-h-[640px] shrink-0 gap-2">
      <div className="group relative grow-[1.6] basis-0 select-none overflow-hidden rounded-lg bg-[#dfe6ea]">
        {photos.length > 0 ? (
          <>
            <div className="h-full w-full overflow-hidden" ref={emblaRef}>
              <div className="flex h-full touch-pan-y">
                {photos.map((p, i) => (
                  <button
                    aria-label={`Open photo ${i + 1} fullscreen`}
                    className="relative h-full min-w-0 flex-[0_0_100%] cursor-zoom-in"
                    key={p.url || `hero-${i}`}
                    onClick={() => openLightbox(i)}
                    type="button"
                  >
                    {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
                    <img
                      alt={headline.addressRaw}
                      className="h-full w-full object-cover"
                      draggable={false}
                      src={sizedPhoto(p.url, 1000)}
                    />
                  </button>
                ))}
              </div>
            </div>
            {canPaginate ? (
              <>
                <button
                  aria-label="Previous photo"
                  className="-translate-y-1/2 absolute top-1/2 left-4 z-10 flex size-10 items-center justify-center rounded-full bg-[rgba(15,42,63,0.6)] text-white opacity-0 transition-opacity hover:bg-[rgba(15,42,63,0.8)] focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={scrollPrev}
                  type="button"
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                </button>
                <button
                  aria-label="Next photo"
                  className="-translate-y-1/2 absolute top-1/2 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-[rgba(15,42,63,0.6)] text-white opacity-0 transition-opacity hover:bg-[rgba(15,42,63,0.8)] focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={scrollNext}
                  type="button"
                >
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={18}
                    strokeWidth={2}
                  />
                </button>
              </>
            ) : null}
            <button
              className="absolute bottom-3.5 left-3.5 bg-[rgba(15,42,63,0.85)] px-3.5 py-2 font-semibold text-[#eef1f4] text-[12px] uppercase tracking-[0.08em] transition-colors hover:bg-[rgba(15,42,63,0.95)]"
              onClick={() => openLightbox(selectedIndex)}
              type="button"
            >
              View all {photoCount} photos
            </button>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] text-slate-2">
            No photo yet
          </div>
        )}
      </div>
      <div className="grid min-w-0 grow basis-0 grid-cols-2 grid-rows-2 gap-2">
        {grid.map(({ photo, index }) => (
          <button
            aria-label={`Show photo ${index + 1}`}
            className="group overflow-hidden rounded-lg bg-[#dfe6ea]"
            key={photo.url || `grid-${index}`}
            onClick={() => emblaApi?.scrollTo(index)}
            type="button"
          >
            {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
            <img
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              draggable={false}
              src={sizedPhoto(photo.url, 360)}
            />
          </button>
        ))}
        {Array.from({ length: Math.max(0, 4 - grid.length) }).map((_, i) => (
          <div className="rounded-lg bg-[#dfe6ea]" key={`filler-${i}`} />
        ))}
      </div>
      <GalleryLightbox
        onOpenChange={setLightboxOpen}
        open={lightboxOpen}
        photos={photos}
        startIndex={lightboxStart}
      />
    </div>
  );
}

/* ---------------- Main column ---------------- */

/** Splits a postcode into its parts so we can take the leading outcode. */
const POSTCODE_PART_RE = /\s+/;

/**
 * Title block — eyebrow · street-name H1 · address+spec subtitle. Lives
 * above the two-column body (full content width) so the side rail's price
 * card aligns with the first MAIN-column card, not with the title.
 */
function ListingTitle({ data }: { data: ListingDetailPayload }) {
  const { headline, cluster } = data;
  const title = shortAddressTitle(headline.addressRaw);
  const outcode = (headline.postcode ?? cluster.postcode)?.split(
    POSTCODE_PART_RE
  )[0];
  const location = outcodeLocationLabel(outcode);
  const subtitleParts = [
    cluster.userAddress ?? headline.addressRaw,
    propertyKindLabel(headline.propertyKind),
    headline.bedrooms != null ? `${headline.bedrooms} bed` : null,
    headline.bathrooms != null ? `${headline.bathrooms} bath` : null,
    data.fineprint.sizeSqFt
      ? `${data.fineprint.sizeSqFt.toLocaleString("en-GB")} sqft`
      : null,
    location,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5 pt-[18px]">
      <span className="font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
        {listedAgoLabel(headline.firstSeenAt)} · {data.portalSpread.length}{" "}
        portal{data.portalSpread.length === 1 ? "" : "s"} tracking
      </span>
      <h1 className="font-semibold text-[44px] text-foreground leading-[46px] tracking-[-0.025em]">
        {title}
      </h1>
      <p className="text-[14px] text-slate">{subtitleParts.join(" · ")}</p>
    </div>
  );
}

function MainColumn({ data }: { data: ListingDetailPayload }) {
  const { headline, cluster } = data;

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <AiCard
        highlights={data.highlights}
        summary={data.summary}
        watchouts={data.watchouts}
      />
      <MediaCard
        brochureUrl={data.agentExtras?.brochureUrl}
        floorplanUrl={data.floorplan?.url}
        sizeSqFt={data.fineprint.sizeSqFt}
      />
      <MapCommute
        commuteMinutes={data.commuteMinutes}
        lat={cluster.lat}
        lng={cluster.lng}
        logoToken={data.logoToken}
        nearbyTransit={data.nearbyTransit}
        postcode={headline.postcode ?? cluster.postcode}
        stationRoutes={data.stationRoutes}
      />
      <PropertyFactsCard agent={data.agentExtras} facts={data.propertyFacts} />
    </section>
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
    <article className="flex flex-col rounded-lg border border-line bg-card">
      <header className="px-6 pt-5 pb-3.5">
        <span className="font-semibold text-[11px] text-slate uppercase tracking-[0.14em]">
          What stands out
        </span>
      </header>
      {summary ? (
        <p className="px-6 pb-2 text-[13px] text-slate leading-[19px]">
          {summary}
        </p>
      ) : null}
      <div className="px-6 pb-5">
        <FeatureList
          items={[
            ...highlightsToPills(highlights),
            ...watchoutsToPills(watchouts),
          ]}
          variant="grid"
        />
      </div>
    </article>
  );
}

const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Floor plan + media card. Surfaces the floor plan (zoomable lightbox) and
 * any listing documents we have — today that's the agent brochure PDF;
 * videos / virtual tours can slot in here once the parsers expose them.
 * Renders nothing when there's neither a floor plan nor a document.
 */
function MediaCard({
  sizeSqFt,
  floorplanUrl,
  brochureUrl,
}: {
  sizeSqFt?: number | null;
  floorplanUrl?: string;
  brochureUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const brochureHref =
    brochureUrl && HTTP_URL_RE.test(brochureUrl) ? brochureUrl : null;
  if (!(floorplanUrl || brochureHref)) {
    return null;
  }
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-line bg-card">
      <header className="flex items-end justify-between px-6 pt-5 pb-3.5">
        <span className="font-semibold text-[11px] text-slate uppercase tracking-[0.14em]">
          Floor plan &amp; media
        </span>
        {sizeSqFt ? (
          <span className="font-medium text-[11px] text-slate-2">
            {sizeSqFt.toLocaleString("en-GB")} sq ft
          </span>
        ) : null}
      </header>
      <div className="flex flex-col gap-3 px-6 pb-6">
        {floorplanUrl ? (
          <div className="flex h-[280px] items-center justify-center overflow-hidden rounded-md border border-line bg-mist">
            <button
              aria-label="Expand floor plan"
              className="group flex h-full w-full cursor-zoom-in items-center justify-center"
              onClick={() => setOpen(true)}
              type="button"
            >
              {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
              <img
                alt="Floor plan"
                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-[1.01]"
                draggable={false}
                src={floorplanUrl}
              />
            </button>
          </div>
        ) : null}
        {brochureHref ? (
          <MediaLink
            href={brochureHref}
            label="Agent brochure"
            meta="PDF · opens on the portal site"
          />
        ) : null}
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

/** A single document/media row inside {@link MediaCard}. */
function MediaLink({
  href,
  label,
  meta,
}: {
  href: string;
  label: string;
  meta: string;
}) {
  return (
    <a
      className="flex items-center gap-3 rounded-md border border-line bg-card px-4 py-3 transition-colors hover:border-steel hover:bg-ground"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mist text-slate">
        <HugeiconsIcon icon={File01Icon} size={16} strokeWidth={1.6} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-[13px] text-foreground leading-4">
          {label}
        </span>
        <span className="text-[11px] text-slate leading-[14px]">{meta}</span>
      </span>
      <HugeiconsIcon
        className="ml-auto shrink-0 text-slate"
        icon={LinkSquare01Icon}
        size={14}
        strokeWidth={1.6}
      />
    </a>
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
        className="grid h-[95vh] w-[95vw] max-w-none place-items-stretch gap-0 overflow-hidden border-0 bg-mist p-0 ring-0 sm:max-w-none"
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
                  {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
                  <img
                    alt="Floor plan"
                    className="max-h-[95vh] max-w-[95vw] object-contain"
                    draggable={false}
                    src={url}
                  />
                </TransformComponent>
                <div className="-translate-x-1/2 absolute bottom-5 left-1/2 flex items-center gap-1 rounded-full bg-[rgba(15,42,63,0.85)] p-1 text-white shadow-lg">
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
            className="absolute top-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-[rgba(15,42,63,0.85)] text-white transition-colors hover:bg-foreground"
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
      className="flex size-9 items-center justify-center rounded-full transition-colors hover:bg-white/15"
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
    </button>
  );
}

/* ---------------- Side rail ---------------- */

function SideRail({
  data,
  disabled,
  onShortlist,
  onSkip,
  onEditAddress,
  pendingAction,
}: {
  data: ListingDetailPayload;
  disabled?: boolean;
  onShortlist: () => void;
  onSkip?: () => void;
  onEditAddress?: () => void;
  pendingAction?: ListingDetailPendingAction;
}) {
  return (
    <aside className="flex w-90 shrink-0 flex-col gap-4">
      <PriceCard
        data={data}
        disabled={disabled}
        onEditAddress={onEditAddress}
        onShortlist={onShortlist}
        onSkip={onSkip}
        pendingAction={pendingAction}
      />
      <CostsCard
        fineprint={data.fineprint}
        priceMonthly={data.headline.priceMonthly}
      />
      <RecordsCard epc={data.epc} publicRecords={data.publicRecords} />
      <FineprintCard fineprint={data.fineprint} />
      <ActivityCard
        firstSeenAt={data.headline.firstSeenAt}
        firstSeenPortal={data.headline.portal}
        mySwipe={data.mySwipe}
        mySwipeAt={data.mySwipeAt}
        partnerSwipes={data.partnerSwipes}
        portalCount={data.portalSpread.length}
      />
    </aside>
  );
}

function PriceCard({
  data,
  disabled,
  onShortlist,
  onSkip,
  onEditAddress,
  pendingAction,
}: {
  data: ListingDetailPayload;
  disabled?: boolean;
  onShortlist: () => void;
  onSkip?: () => void;
  onEditAddress?: () => void;
  pendingAction?: ListingDetailPendingAction;
}) {
  const { headline, portalSpread, cluster, mySwipe } = data;
  const { rows: portalRows, hasSpread: portalHasSpread } =
    toPortalRows(portalSpread);
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  // Until a verdict is recorded, offer both Keep and Veto.
  const reviewed = mySwipe != null;
  const waitingNames = data.partnerSwipes
    .filter((s) => !(s.outcome === "keep" || s.outcome === "shortlist"))
    .map((s) => s.name);
  return (
    <article className="flex flex-col gap-[18px] rounded-lg border border-navy bg-card p-6">
      <PriceBlock priceMonthly={headline.priceMonthly} size="lg" suffix="/mo" />
      <PortalList hasSpread={portalHasSpread} rows={portalRows} variant="rail" />
      {onEditAddress ? (
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line bg-card p-3 text-[12px] text-foreground hover:bg-ground"
          onClick={onEditAddress}
          type="button"
        >
          <HugeiconsIcon
            icon={MapsLocation01Icon}
            size={13}
            strokeWidth={1.6}
          />
          {cluster.userAddress ? "Edit pinned address" : "Add exact address"}
        </button>
      ) : null}
      <PriceActions
        disabled={disabled}
        iKept={iKept}
        mySwipe={mySwipe}
        onShortlist={onShortlist}
        onSkip={onSkip}
        pendingAction={pendingAction}
        reviewed={reviewed}
        waitingNames={waitingNames}
      />
    </article>
  );
}

/** Keep / Veto verdict buttons. */
function PriceActions({
  mySwipe,
  waitingNames,
  iKept,
  reviewed,
  disabled,
  pendingAction,
  onShortlist,
  onSkip,
}: {
  mySwipe?: Outcome;
  waitingNames: string[];
  iKept: boolean;
  reviewed: boolean;
  disabled?: boolean;
  pendingAction?: ListingDetailPendingAction;
  onShortlist: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      <button
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-pressed={iKept}
        className={cn(
          "flex items-center justify-center gap-2.5 rounded-md p-4 font-medium text-sm disabled:opacity-50",
          iKept ? "bg-mist text-foreground" : "bg-[#0f2a3f] text-[#eef1f4]"
        )}
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        <HugeiconsIcon
          className={cn(
            pendingAction === "shortlist" ? "animate-spin" : "text-copper",
            iKept && pendingAction !== "shortlist" ? "text-copper" : ""
          )}
          icon={pendingAction === "shortlist" ? Loading03Icon : FavouriteIcon}
          size={16}
          strokeWidth={1.8}
        />
        <span>{shortlistLabel(mySwipe, waitingNames)}</span>
      </button>
      {!reviewed && onSkip ? (
        <button
          aria-busy={pendingAction === "skip" || undefined}
          className="flex items-center justify-center gap-2.5 rounded-md border border-line bg-card p-4 font-medium text-foreground text-sm transition-colors hover:bg-ground disabled:opacity-50"
          disabled={disabled}
          onClick={onSkip}
          type="button"
        >
          <HugeiconsIcon
            className={pendingAction === "skip" ? "animate-spin" : undefined}
            icon={pendingAction === "skip" ? Loading03Icon : Cancel01Icon}
            size={16}
            strokeWidth={1.8}
          />
          <span>Veto</span>
        </button>
      ) : null}
    </div>
  );
}

function shortlistLabel(
  mySwipe: Outcome | undefined,
  waitingNames: string[]
): string {
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  if (!iKept) {
    return "Keep · shortlist";
  }
  if (waitingNames.length === 0) {
    return "Shortlisted";
  }
  const first = waitingNames[0] ?? "them";
  const rest = waitingNames.length - 1;
  return rest > 0
    ? `Kept · waiting on ${first} +${rest}`
    : `Kept · waiting on ${first}`;
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
    <article className="flex flex-col rounded-lg border border-line bg-card px-6 py-5">
      <div className="border-mist border-b pb-3">
        <span className="font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
          Public Records
        </span>
      </div>
      {rows.map((row, i) => (
        <div
          className={cn(
            "flex items-center justify-between py-3",
            i < rows.length - 1 && "border-mist border-b"
          )}
          key={row.label}
        >
          <span className="text-[13px] text-slate">{row.label}</span>
          <div className="flex flex-col items-end">
            {row.chipClass ? (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded px-1.5 py-0.5 font-semibold text-[13px] tabular-nums",
                  row.chipClass
                )}
              >
                {row.value}
              </span>
            ) : (
              <span className="font-semibold text-[13px] text-foreground">
                {row.value}
              </span>
            )}
            {row.meta ? (
              <span className="mt-0.5 text-[10px] text-slate-2">{row.meta}</span>
            ) : null}
          </div>
        </div>
      ))}
    </article>
  );
}

/* ---------------- Atoms + helpers ---------------- */

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
  const firstLine = idx === -1 ? addressRaw : addressRaw.slice(0, idx);
  return stripLeadingHouseNumber(firstLine.trim());
}

/**
 * Paper's listing title is the street name only ("Belsize Park Mews"), with
 * the full address living in the subtitle. Strip a leading house/flat number
 * ("22 Belsize Park Mews" → "Belsize Park Mews", "Flat 2 Camden Lock" →
 * "Camden Lock") while leaving named buildings intact.
 */
function stripLeadingHouseNumber(line: string): string {
  const stripped = line.replace(/^(flat|unit|apartment|apt)\s+\w+\s+/i, "");
  const withoutNumber = stripped.replace(/^\d+[a-z]?\s+/i, "");
  return withoutNumber.length > 0 ? withoutNumber : line;
}

type RecordRow = {
  label: string;
  value: string;
  meta?: string;
  /**
   * Tailwind classes for an EPC band chip (bg + text), so the rating
   * reads like the coloured strip on the certificate itself. Only the
   * EPC row sets it; everything else renders a plain value.
   */
  chipClass?: string;
};

/**
 * Official EPC certificate band colours (the GOV.UK EPC palette) as full
 * literal class strings so Tailwind's JIT keeps them. Literal hex because
 * these are a fixed external standard, not maritime tokens; `text`
 * switches to dark on the light-green / yellow / amber bands where white
 * would wash out.
 */
const EPC_BAND_CHIP: Record<string, string> = {
  A: "bg-[#008054] text-white",
  B: "bg-[#19b459] text-white",
  C: "bg-[#8dce46] text-[#0a2e1a]",
  D: "bg-[#ffd500] text-[#3d3500]",
  E: "bg-[#fcaa65] text-[#3d2400]",
  F: "bg-[#ef8023] text-white",
  G: "bg-[#e9153b] text-white",
};

/** Chip classes for a rating like "C" / "~D" — keyed by the band letter. */
function epcBandChip(rating: string): string | undefined {
  return EPC_BAND_CHIP[rating.trim().charAt(0).toUpperCase()];
}

function buildRecordRows(
  epc: ListingDetailPayload["epc"],
  publicRecords?: ListingDetailPublicRecords
): RecordRow[] {
  const rows: RecordRow[] = [];
  // EPC always shows — falls back to an "Unknown" placeholder when we have
  // neither a certificate nor a postcode estimate.
  rows.push(epcRecordRow(epc));
  const broadband = broadbandRecordRow(publicRecords?.broadband);
  if (broadband) {
    rows.push(broadband);
  }
  const amenities = amenitiesRecordRow(publicRecords?.amenities);
  if (amenities) {
    rows.push(amenities);
  }
  return rows;
}

function epcRecordRow(epc: ListingDetailPayload["epc"]): RecordRow {
  // Only building-specific bands are shown (portal-published or an exact
  // register match); no postcode estimate fallback, so "Unknown" when we
  // have neither.
  if (!epc) {
    return { label: "EPC rating", value: "Unknown" };
  }
  const meta =
    epc.source === "portal"
      ? "As published on the listing"
      : epc.potential
        ? `Potential ${epc.potential}`
        : undefined;
  return {
    label: "EPC rating",
    value: epc.rating,
    meta,
    chipClass: epcBandChip(epc.rating),
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
    meta: bb.fttpAvailable ? "Gigabit-capable" : undefined,
  };
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
    label: "Within 500m",
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
