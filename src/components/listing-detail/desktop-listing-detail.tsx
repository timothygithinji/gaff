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
  Alert02Icon,
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
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useMemo, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
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
  ListingDetailNearbyTransit,
  ListingDetailPartnerSwipe,
  ListingDetailPayload,
  ListingDetailPhoto,
  ListingDetailPortalRow,
  ListingDetailPublicRecords,
  ListingDetailStationRoute,
  ListingDetailWatchout,
} from "../../server/functions/listing-detail";
import { AdminSidebar } from "../layout/admin-sidebar";
import { PortalLogo } from "../portal-logo";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { CostsCard } from "./costs";
import { GalleryLightbox } from "./gallery-lightbox";
import { MapView, type RouteTimes, type TransitPoint } from "./map-view";
import { PropertyFactsCard } from "./property-facts";
import { StationGlyphs } from "./transit-glyph";

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
      <MapCommuteCard
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
      <div className="grid grid-cols-2 gap-x-6 px-6 pb-5">
        {highlights.map((item, idx) => (
          <SignalRow
            icon={Tick02Icon}
            item={item}
            key={`h:${item.label}:${idx}`}
            tone="success"
          />
        ))}
        {watchouts.map((item, idx) => (
          <SignalRow
            icon={Alert02Icon}
            item={item}
            key={`w:${item.label}:${idx}`}
            tone={item.severity === "problem" ? "destructive" : "warning"}
          />
        ))}
      </div>
    </article>
  );
}

function signalToneClass(tone: "success" | "warning" | "destructive"): string {
  if (tone === "success") {
    return "text-success";
  }
  if (tone === "destructive") {
    return "text-destructive";
  }
  return "text-warning";
}

function SignalRow({
  icon,
  item,
  tone,
}: {
  icon: typeof Tick02Icon;
  item: { label: string; detail?: string | null };
  tone: "success" | "warning" | "destructive";
}) {
  const toneClass = signalToneClass(tone);
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <HugeiconsIcon
        className={cn("mt-px shrink-0", toneClass)}
        icon={icon}
        size={16}
        strokeWidth={1.8}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium text-[13px] text-foreground leading-4">
          {item.label}
        </p>
        {item.detail ? (
          <p className="text-[11px] text-slate-2 leading-[14px]">
            {item.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type PlaceCategory = ListingDetailNearbyTransit["category"];

const CATEGORY_DOT: Record<PlaceCategory, string> = {
  transport: "bg-[#1f4e79]",
  park: "bg-[#2e7d52]",
  shop: "bg-[#b07a2c]",
  gp: "bg-[#b3453a]",
  restaurant: "bg-[#d77a4a]",
};

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  transport: "Transport",
  park: "Parks",
  shop: "Shops",
  gp: "GPs",
  restaurant: "Food",
};

/** Display order for the grouped chip sections. */
const CATEGORY_ORDER: PlaceCategory[] = [
  "transport",
  "park",
  "shop",
  "gp",
  "restaurant",
];

/** Nearest bus stops to keep — they otherwise swamp the real stations. */
const BUS_CAP = 3;
/** How many chips a category shows before the "+N more" expander. */
const CATEGORY_CAP: Record<PlaceCategory, number> = {
  transport: 8,
  park: 4,
  shop: 5,
  gp: 4,
  restaurant: 5,
};

/** Stable id for a nearby place — category + name + rounded coords. */
function transitPointId(t: ListingDetailNearbyTransit): string {
  return `${t.category}:${t.name}:${t.lat.toFixed(5)},${t.lng.toFixed(5)}`;
}

const STATION_NAME_RE = /\bstation\b/i;

/** Geocodable destination for a name-only fallback station. */
function stationQuery(name: string): string {
  const withKind = STATION_NAME_RE.test(name) ? name : `${name} station`;
  return `${withKind}, London`;
}

/**
 * A distinct colour per place, so each route is individually tellable
 * apart on the map. Golden-angle hue spread keeps adjacent indices far
 * apart on the wheel; mid sat/lightness reads on both map styles.
 */
function routeColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 70% 50%)`;
}

const STOP_CODE_RE = /\s*\(stop[^)]*\)/gi;
const SURGERY_SITE_RE = /\s*-\s*[^-]*\bsite\s*$/i;
const MULTISPACE_RE = /\s+/g;
const HAS_UPPER_RE = /[A-Z]/;

/** Title-case a shouty token ("STATION" → "Station"), leave "bp"/"M&S" be. */
function tidyToken(w: string): string {
  if (w.length > 1 && w === w.toUpperCase() && HAS_UPPER_RE.test(w)) {
    return w.charAt(0) + w.slice(1).toLowerCase();
  }
  return w;
}

/**
 * Tidy a raw place name for display: drop "(Stop GA)" bus codes and the
 * "- … Surgery Site" cruft, collapse whitespace, and de-shout ALL-CAPS
 * words ("STATION SUPERMARKET" → "Station Supermarket").
 */
function normalizePlaceName(raw: string): string {
  const stripped = raw
    .replace(STOP_CODE_RE, "")
    .replace(SURGERY_SITE_RE, "")
    .replace(MULTISPACE_RE, " ")
    .trim();
  const tidied = stripped.split(" ").map(tidyToken).join(" ");
  return tidied || raw.trim();
}

/**
 * Recognisable UK chains → their domain, so we can pull a brand logo from
 * logo.dev. Independents won't match and fall back to a category dot.
 */
const BRAND_DOMAINS: Array<[RegExp, string]> = [
  [/\bbp\b/i, "bp.com"],
  [/\bshell\b/i, "shell.com"],
  [/\besso\b/i, "esso.co.uk"],
  [/\bnisa\b/i, "nisalocal.co.uk"],
  [/\btesco\b/i, "tesco.com"],
  [/\bsainsbury/i, "sainsburys.co.uk"],
  [/\bco-?op\b/i, "coop.co.uk"],
  [/\blidl\b/i, "lidl.co.uk"],
  [/\baldi\b/i, "aldi.co.uk"],
  [/\bmorrisons?\b/i, "morrisons.com"],
  [/\basda\b/i, "asda.com"],
  [/\bwaitrose\b/i, "waitrose.com"],
  [/\bm&s\b|marks?\s*&?\s*spencer/i, "marksandspencer.com"],
  [/\bcosta\b/i, "costa.co.uk"],
  [/\bstarbucks\b/i, "starbucks.com"],
  [/\bgreggs\b/i, "greggs.co.uk"],
  [/\bpret\b/i, "pret.com"],
  [/\bmcdonald/i, "mcdonalds.com"],
  [/\bkfc\b/i, "kfc.co.uk"],
  [/\bsubway\b/i, "subway.com"],
  [/\bdomino/i, "dominos.co.uk"],
  [/\bnando/i, "nandos.co.uk"],
  [/\bburger king\b/i, "burgerking.co.uk"],
  [/\bpapa john/i, "papajohns.co.uk"],
  [/\bboots\b/i, "boots.com"],
  [/\bsuperdrug\b/i, "superdrug.com"],
];

function brandDomainFor(name: string): string | null {
  for (const [re, domain] of BRAND_DOMAINS) {
    if (re.test(name)) {
      return domain;
    }
  }
  return null;
}

/** logo.dev image URL for a domain (publishable token, client-safe). */
function logoUrl(domain: string, token: string): string {
  return `https://img.logo.dev/${domain}?token=${token}&size=40&format=png&fallback=404`;
}

/** Chip suffix: computed walk / transit minutes once a place is routed. */
function formatRouteTimes(t: RouteTimes): string {
  const parts: string[] = [];
  if (t.walkMinutes != null) {
    parts.push(`${t.walkMinutes}m walk`);
  }
  if (t.transitMinutes != null && t.transitMinutes !== t.walkMinutes) {
    parts.push(`${t.transitMinutes}m transit`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no route";
}

function MapCommuteCard({
  postcode,
  commuteMinutes,
  stationRoutes,
  nearbyTransit,
  lat,
  lng,
  logoToken,
}: {
  postcode: string | null;
  commuteMinutes?: Record<string, number>;
  stationRoutes?: ListingDetailStationRoute[];
  nearbyTransit?: ListingDetailNearbyTransit[];
  lat: string | null;
  lng: string | null;
  logoToken?: string;
}) {
  const firstTarget = commuteMinutes
    ? Object.entries(commuteMinutes)[0]
    : undefined;
  const latNum = lat ? Number(lat) : Number.NaN;
  const lngNum = lng ? Number(lng) : Number.NaN;
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const title = postcode ? `London ${postcode.toUpperCase()}` : "Where it sits";

  // Memoised so the map's marker layer isn't rebuilt on every render.
  // Prefer the Places sweep (coords → real markers + routes); fall back to
  // the Rightmove nearest stations (name-only → routed by geocoded name,
  // no marker) so the chips are interactive even before enrichment runs.
  const points = useMemo<TransitPoint[]>(() => {
    if (nearbyTransit && nearbyTransit.length > 0) {
      return nearbyTransit.map((t, i) => ({
        id: transitPointId(t),
        name: normalizePlaceName(t.name),
        category: t.category,
        kind: t.kind,
        modes: t.modes,
        color: routeColor(i),
        lat: t.lat,
        lng: t.lng,
        distanceMiles: t.distanceMiles,
      }));
    }
    return (stationRoutes ?? []).map((s, i) => ({
      id: `station:${s.name}:${i}`,
      name: normalizePlaceName(s.name),
      category: "transport" as const,
      kind: "rail" as const,
      color: routeColor(i),
      query: stationQuery(s.name),
      distanceMiles: s.distanceMiles ?? null,
    }));
  }, [nearbyTransit, stationRoutes]);

  // Per-category display lists: dedupe by name (the three "Bounds Green
  // Station" bus stops collapse to one), keeping nearest-first, with buses
  // sub-capped so they don't drown the real stations.
  const groupsByCategory = useMemo(() => {
    const seen = new Set<string>();
    const byCat = new Map<PlaceCategory, TransitPoint[]>();
    let busCount = 0;
    for (const p of points) {
      const key = `${p.category}:${p.name.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      if (p.category === "transport" && p.kind === "bus") {
        if (busCount >= BUS_CAP) {
          continue;
        }
        busCount += 1;
      }
      seen.add(key);
      const list = byCat.get(p.category) ?? [];
      list.push(p);
      byCat.set(p.category, list);
    }
    return byCat;
  }, [points]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = useCallback((cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  // Selection + computed-times live here. Every place's colour shows by
  // default (markers + chip dots), but routes are drawn on demand — tap a
  // chip to draw its walking route (in its colour) and compute its time.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [times, setTimes] = useState<Record<string, RouteTimes>>({});
  const selectedIds = useMemo(() => [...selected], [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const handleRouteComputed = useCallback((id: string, t: RouteTimes) => {
    setTimes((prev) => (prev[id] ? prev : { ...prev, [id]: t }));
  }, []);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-line bg-card">
      <header className="flex items-center justify-between px-6 pt-5 pb-3.5">
        <span className="font-semibold text-[11px] text-slate uppercase tracking-[0.14em]">
          Where it sits
        </span>
        <a
          className="inline-flex items-center gap-1 text-[11px] text-copper"
          href={
            hasCoords
              ? `https://www.google.com/maps/search/?api=1&query=${latNum},${lngNum}`
              : "#"
          }
          rel="noopener noreferrer"
          target="_blank"
        >
          <HugeiconsIcon
            icon={MapsLocation01Icon}
            size={12}
            strokeWidth={1.8}
          />
          Open in Google Maps
        </a>
      </header>
      <div className="mx-6 aspect-[16/9] overflow-hidden rounded-md border border-line bg-[#d7e0e6] dark:bg-mist">
        {hasCoords ? (
          <MapView
            lat={latNum}
            lng={lngNum}
            onRouteComputed={handleRouteComputed}
            onTogglePoint={toggle}
            points={points}
            selectedIds={selectedIds}
            title={title}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] text-slate-2">
            Location pending
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 px-6 pt-3.5 pb-6">
        {firstTarget ? (
          <span className="inline-flex w-fit items-baseline gap-1.5 rounded-md bg-mist px-3 py-2">
            <span className="font-semibold text-[11px] text-slate uppercase tracking-[0.08em]">
              To {firstTarget[0]}
            </span>
            <span className="font-semibold text-[13px] text-foreground">
              {firstTarget[1]} min
            </span>
          </span>
        ) : null}

        {points.length > 0 ? (
          <div className="flex flex-col gap-3">
            <span className="font-normal text-[11px] text-slate-2">
              What's nearby — tap a chip to show its route
            </span>
            {CATEGORY_ORDER.map((cat) => {
              const group = groupsByCategory.get(cat) ?? [];
              if (group.length === 0) {
                return null;
              }
              const isOpen = expanded.has(cat);
              const shown = isOpen ? group : group.slice(0, CATEGORY_CAP[cat]);
              const hidden = group.length - shown.length;
              return (
                <div className="flex flex-col gap-1.5" key={cat}>
                  <span className="flex items-center gap-1.5 font-semibold text-[10px] text-slate uppercase tracking-[0.1em]">
                    <span
                      className={cn("size-1.5 rounded-full", CATEGORY_DOT[cat])}
                    />
                    {CATEGORY_LABEL[cat]}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {shown.map((p) => (
                      <PlaceChip
                        key={p.id}
                        logoToken={logoToken}
                        onToggle={toggle}
                        point={p}
                        selected={selected.has(p.id)}
                        times={times[p.id]}
                      />
                    ))}
                    {hidden > 0 || isOpen ? (
                      <button
                        className="rounded-md px-2 py-2 text-[11px] text-copper hover:underline"
                        onClick={() => toggleExpanded(cat)}
                        type="button"
                      >
                        {isOpen ? "Show less" : `+${hidden} more`}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The leading mark for a chip: TfL roundel(s) for a station, a brand logo
 * (logo.dev) for a recognised chain, else a small category dot. Logos
 * that 404 fall back to the dot.
 */
function LeadingMark({
  point,
  logoToken,
}: {
  point: TransitPoint;
  logoToken?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  if (point.category === "transport" && (point.modes?.length || point.kind)) {
    return <StationGlyphs kind={point.kind} modes={point.modes} size={14} />;
  }
  const domain = logoToken ? brandDomainFor(point.name) : null;
  if (domain && logoToken && !logoFailed) {
    return (
      // biome-ignore lint/nursery/noImgElement: external logo.dev CDN, no loader.
      <img
        alt=""
        className="size-4 shrink-0 rounded-[3px] object-contain"
        loading="lazy"
        onError={() => setLogoFailed(true)}
        src={logoUrl(domain, logoToken)}
      />
    );
  }
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", CATEGORY_DOT[point.category])}
    />
  );
}

/** One nearby-place chip: leading mark + name + distance (+ real time when routed). */
function PlaceChip({
  point,
  selected,
  times,
  onToggle,
  logoToken,
}: {
  point: TransitPoint;
  selected: boolean;
  times: RouteTimes | undefined;
  onToggle: (id: string) => void;
  logoToken?: string;
}) {
  // Keep the chip calm: distance always, real walk/transit only once a
  // route's been drawn (no always-on estimate).
  const trailing = times
    ? formatRouteTimes(times)
    : selected
      ? "routing…"
      : null;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[12px] transition-colors",
        selected
          ? "border-copper bg-copper/10"
          : "border-line bg-mist hover:border-slate-2"
      )}
      onClick={() => onToggle(point.id)}
      type="button"
    >
      <LeadingMark logoToken={logoToken} point={point} />
      <span className="font-medium text-foreground">{point.name}</span>
      {point.distanceMiles != null ? (
        <span className="text-slate">{point.distanceMiles.toFixed(1)} mi</span>
      ) : null}
      {trailing ? <span className="text-slate">· {trailing}</span> : null}
    </button>
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
  // Only crown a "cheapest" portal when some portal is actually dearer; if
  // every portal lists the same rent there's nothing to crown.
  const cheapestPortalPrice = portalSpread[0]?.priceMonthly ?? null;
  const portalHasSpread =
    cheapestPortalPrice !== null &&
    portalSpread.some(
      (p) => p.priceMonthly !== null && p.priceMonthly > cheapestPortalPrice
    );
  const iKept = mySwipe === "keep" || mySwipe === "shortlist";
  // Until a verdict is recorded, offer both Keep and Veto.
  const reviewed = mySwipe != null;
  const waitingNames = data.partnerSwipes
    .filter((s) => !(s.outcome === "keep" || s.outcome === "shortlist"))
    .map((s) => s.name);
  return (
    <article className="flex flex-col gap-[18px] rounded-lg border border-navy bg-card p-6">
      <div className="flex items-baseline gap-1.5">
        <span className="font-light text-[40px] text-foreground leading-10 tracking-[-0.025em]">
          {formatPrice(headline.priceMonthly)}
        </span>
        <span className="text-[13px] text-slate">/mo</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {portalSpread.map((row, idx) => (
          <PortalRow
            key={`${row.portal}-${row.url}`}
            row={row}
            showCheapest={portalHasSpread && idx === 0}
          />
        ))}
      </div>
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

function PortalRow({
  row,
  showCheapest,
}: {
  row: ListingDetailPortalRow;
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
      {/* Price sits under the (full-width) portal name, indented to line up
          with the name past the badge (24px badge + 10px gap). */}
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

type ActivityItem = {
  title: string;
  sub: string;
  active: boolean;
  /** Relative timestamp (e.g. "12 min ago"), or null when unknown. */
  date: string | null;
};

function ActivityCard({
  mySwipe,
  mySwipeAt,
  partnerSwipes,
  portalCount,
  firstSeenPortal,
  firstSeenAt,
}: {
  mySwipe?: Outcome;
  mySwipeAt: string | null;
  partnerSwipes: ListingDetailPartnerSwipe[];
  portalCount: number;
  firstSeenPortal: string;
  firstSeenAt: string;
}) {
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

  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-line bg-card p-[22px]">
      <span className="font-normal text-[11px] text-slate uppercase tracking-[0.14em]">
        Household activity
      </span>
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
    </article>
  );
}

/**
 * Relative-time label ("just now" / "12 min ago" / "3 hr ago" / "2 days ago"
 * / "5 wk ago"), or null for a missing/invalid timestamp. Computed at render
 * time like {@link listedAgoLabel} — fine for day/hour granularity.
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

/* ---------------- Atoms + helpers ---------------- */

const WHITESPACE_RE = /\s+/;

function firstName(name: string): string {
  return (name || "").trim().split(WHITESPACE_RE)[0] || name;
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
