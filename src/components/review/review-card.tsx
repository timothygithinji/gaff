import useEmblaCarousel from "embla-carousel-react";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { useEmblaSelectedIndex } from "../../hooks/use-embla-selected-index";
import { sizedPhoto } from "../../lib/photo-size";
import { cn } from "../../lib/utils";
/**
 * The mobile review card — rooted in Paper "Review · Mobile" (artboard 23F,
 * "Hero card"), extended into the swipe deck {@link MobileReviewCard}.
 *
 * Sharp 2px radius (Paper uses a crisp corner on the review card, not the
 * global pillowy radius), 1px hairline border, white surface. Structure
 * top → bottom:
 *
 *   1. Photo — fills the phone screen (fixed comfortable height on tablet),
 *      swipeable Embla carousel, "New · Nhr" pill top-left (copper dot) +
 *      "n / N" counter and dot indicator bottom.
 *   2. Headline row — address + sub-spec on the left, price + "per month"
 *      on the right.
 *   3. Tag row — sharp highlight pills (navy ✓) + watch-out pills (copper !)
 *      from the v2 features schema.
 *   4. Stats strip — Commute · EPC, divided by hairlines.
 *   5. Portal row — overlapping portal avatars + "N portals tracking ·
 *      <cheapest> cheapest".
 *
 * Presentation only — consumes the same `ReviewCard` the route hands in.
 */
import type { ReviewCard as ReviewCardData } from "../../server/functions/review";

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function portalLabel(portal: string): string {
  switch (portal.toLowerCase()) {
    case "rightmove":
      return "Rightmove";
    case "zoopla":
      return "Zoopla";
    case "openrent":
      return "OpenRent";
    default:
      return portal.charAt(0).toUpperCase() + portal.slice(1);
  }
}

/** Build the "NW3 · 2 bed · 1 bath · 712 sqft" sub-spec line. */
function subSpec(card: ReviewCardData): string {
  const hl = card.headlineListing;
  const parts: string[] = [];
  if (hl.outcode) {
    parts.push(hl.outcode);
  }
  if (hl.bedrooms != null) {
    parts.push(`${hl.bedrooms} bed`);
  }
  if (hl.bathrooms != null) {
    parts.push(`${hl.bathrooms} bath`);
  }
  if (hl.sizeSqFt != null) {
    parts.push(`${hl.sizeSqFt.toLocaleString("en-GB")} sqft`);
  }
  return parts.join(" · ");
}

const DECIDE_THRESHOLD = 110;

/**
 * Mobile review deck — the swipe surface. Photos browse via a horizontal
 * Embla carousel; dragging the card *body* left/right past a threshold
 * skips/keeps (the photo strip keeps its own horizontal swipe, so the two
 * gestures live in separate regions and never fight); a tap opens the full
 * listing. Headline/tags/stats/portals are shared with {@link ReviewCardView}.
 * Sized to fill the phone screen; on tablet it sits at a fixed comfortable
 * height (the route centres it).
 */
export function MobileReviewCard({
  card,
  disabled,
  onOpenDetail,
  onSkip,
  onShortlist,
}: {
  card: ReviewCardData;
  disabled?: boolean;
  onOpenDetail: () => void;
  onSkip: () => void;
  onShortlist: () => void;
}) {
  const hl = card.headlineListing;
  const photos = hl.photos;
  const photoCount = Math.max(photos.length, 1);
  const fresh = card.freshnessLabel;
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start" });
  const photoIndex = useEmblaSelectedIndex(emblaApi);

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (disabled) {
      return;
    }
    startRef.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (startRef.current) {
      setDx(e.clientX - startRef.current.x);
    }
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);
    setDx(0);
    if (!start) {
      return;
    }
    const moveX = e.clientX - start.x;
    const moveY = e.clientY - start.y;
    const elapsed = e.timeStamp - start.t;
    // A near-stationary quick press is a tap → open the full listing.
    if (Math.hypot(moveX, moveY) < 8 && elapsed < 350) {
      onOpenDetail();
      return;
    }
    if (moveX > DECIDE_THRESHOLD) {
      onShortlist();
    } else if (moveX < -DECIDE_THRESHOLD) {
      onSkip();
    }
  };

  const keepHint = Math.max(0, Math.min(1, dx / DECIDE_THRESHOLD));
  const skipHint = Math.max(0, Math.min(1, -dx / DECIDE_THRESHOLD));

  return (
    <article
      className="relative mx-5 flex flex-1 flex-col overflow-hidden rounded-[2px] border border-line bg-paper sm:flex-none"
      style={{
        transform: dx
          ? `translateX(${dx}px) rotate(${dx * 0.015}deg)`
          : undefined,
        transition: dragging ? "none" : "transform 0.2s ease-out",
      }}
    >
      <span
        className='pointer-events-none absolute top-4 left-4 z-10 rounded bg-primary px-2.5 py-1 font-semibold text-[#eef1f4] text-[11px] uppercase tracking-[0.14em]'
        style={{ opacity: keepHint }}
      >
        Keep
      </span>
      <span
        className="pointer-events-none absolute top-4 right-4 z-10 rounded bg-warning-text px-2.5 py-1 font-semibold text-[11px] text-white uppercase tracking-[0.14em]"
        style={{ opacity: skipHint }}
      >
        Skip
      </span>

      {/* 1 — Photos (swipe to browse · tap to open) */}
      <div className="relative min-h-[260px] w-full flex-1 overflow-hidden bg-[#d6dee5] sm:h-[420px] sm:flex-none">
        {photos.length ? (
          <div className="absolute inset-0 overflow-hidden" ref={emblaRef}>
            <div className="flex h-full">
              {photos.map((p, i) => (
                <div
                  className="relative h-full w-full flex-[0_0_100%]"
                  key={`${p}-${i}`}
                >
                  {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; R2 URLs are already cache-friendly. */}
                  <img
                    alt={hl.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    src={sizedPhoto(p, 720)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-[12px] text-slate">No photo yet</p>
          </div>
        )}
        {fresh ? (
          <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 bg-[rgba(14,34,53,0.85)] px-2.5 py-1.5 font-semibold text-[10px] text-white uppercase tracking-[0.12em] backdrop-blur">
            <span className="size-[5px] rounded-full bg-copper" />
            {fresh}
          </span>
        ) : null}
        <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center bg-[rgba(255,255,255,0.92)] px-2 py-1 text-[10px] text-navy tracking-[0.08em]">
          {Math.min(photoIndex + 1, photoCount)} / {photoCount}
        </span>
        {photoCount > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((p, i) => (
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  i === photoIndex ? "bg-white" : "bg-white/45"
                )}
                key={`dot-${p}-${i}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* 2 — Body (drag to decide · tap to open) */}
      <div
        className="cursor-pointer select-none"
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        style={{ touchAction: "pan-y" }}
      >
        <div className="flex items-baseline justify-between gap-3 px-[18px] pt-[18px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-semibold text-[17px] text-navy leading-[22px] tracking-[-0.01em]">
              {hl.title}
            </h2>
            <p className="text-[12px] text-slate leading-4">{subSpec(card)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <p className="font-light text-[22px] text-navy leading-[22px] tracking-[-0.02em]">
              {formatPrice(hl.priceMonthly)}
            </p>
            <p className="text-[10px] text-slate leading-3">per month</p>
          </div>
        </div>
        <CardTags card={card} />
        <CardStats card={card} />
        <CardPortals card={card} />
      </div>
    </article>
  );
}

const MAX_TAGS = 3;

function CardTags({ card }: { card: ReviewCardData }) {
  const features = card.features;
  if (!features) {
    return null;
  }
  const highlights = (features.highlights ?? []).map((h) => ({
    label: h.label,
    warn: false,
  }));
  const watchouts = (features.watchouts ?? []).map((w) => ({
    label: w.label,
    warn: true,
  }));
  const tags = [...highlights, ...watchouts].slice(0, MAX_TAGS);
  if (tags.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-[18px] pt-3.5">
      {tags.map((t) =>
        t.warn ? (
          <span
            className="inline-flex items-center gap-1.5 border border-[rgba(215,122,74,0.4)] bg-[rgba(215,122,74,0.1)] px-[9px] py-[5px] text-[11px] text-navy leading-[14px]"
            key={`warn-${t.label}`}
          >
            <span className="font-semibold text-[11px] text-copper leading-none">
              !
            </span>
            {t.label}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 border border-line bg-mist px-[9px] py-[5px] text-[11px] text-navy leading-[14px]"
            key={`hl-${t.label}`}
          >
            <CheckGlyph />
            {t.label}
          </span>
        )
      )}
    </div>
  );
}

function CardStats({ card }: { card: ReviewCardData }) {
  const { commuteMinutes, epcRating } = card;
  const commute = commuteMinutes == null ? "—" : `${commuteMinutes}`;
  const epc = epcRating ?? "—";
  return (
    <div className="mx-[18px] mt-[18px] flex border-mist border-t pt-[18px]">
      <StatCell
        label="Commute"
        position="first"
        unit={commuteMinutes == null ? undefined : "min"}
        value={commute}
      />
      <StatCell label="EPC" position="last" value={epc} />
    </div>
  );
}

function StatCell({
  label,
  value,
  unit,
  position,
}: {
  label: string;
  value: string;
  unit?: string;
  position: "first" | "mid" | "last";
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-1",
        position === "first" && "border-mist border-r pr-3.5",
        position === "mid" && "border-mist border-r px-3.5",
        position === "last" && "pl-3.5"
      )}
    >
      <span className='text-[9px] text-slate uppercase leading-3 tracking-[0.14em]'>
        {label}
      </span>
      <div className="flex items-baseline gap-[3px]">
        <span className="font-medium text-[18px] text-navy leading-[22px]">
          {value}
        </span>
        {unit ? (
          <span className="text-[11px] text-slate leading-[14px]">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

/** Single-letter portal initial for the overlapping avatar stack. */
function portalInitial(portal: string): string {
  return portalLabel(portal).charAt(0).toUpperCase();
}

const AVATAR_BG = ["bg-primary", "bg-slate", "bg-steel"];

function CardPortals({ card }: { card: ReviewCardData }) {
  const { headlineListing, portalsAlsoOn } = card;
  // Distinct portals across the cluster, headline first.
  const seen = new Set<string>();
  const portals: string[] = [];
  for (const p of [
    headlineListing.portal,
    ...portalsAlsoOn.map((x) => x.portal),
  ]) {
    const pretty = portalLabel(p);
    if (!seen.has(pretty)) {
      seen.add(pretty);
      portals.push(p);
    }
  }
  const count = portals.length;
  const cheapest = portalLabel(headlineListing.portal);
  // Only say "cheapest" when a portal is actually dearer than the headline;
  // if every portal lists the same rent there's no cheapest to call out.
  const headlinePrice = headlineListing.priceMonthly;
  const hasSpread =
    headlinePrice != null &&
    portalsAlsoOn.some(
      (x) => x.priceMonthly != null && x.priceMonthly > headlinePrice
    );
  let summary: string;
  if (count <= 1) {
    summary = `Tracking on ${cheapest}`;
  } else if (hasSpread) {
    summary = `${count} portals tracking · ${cheapest} cheapest`;
  } else {
    summary = `${count} portals tracking`;
  }
  return (
    <div className="flex items-center gap-2.5 px-[18px] pt-4 pb-[18px]">
      <div className="flex items-center">
        {portals.slice(0, 3).map((p, i) => (
          <span
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full border-2 border-white font-semibold text-[9px] text-white",
              AVATAR_BG[i] ?? "bg-steel",
              i > 0 && "-ml-2"
            )}
            key={p}
          >
            {portalInitial(p)}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-slate leading-[14px]">{summary}</p>
    </div>
  );
}

/** The crisp 10px check used on highlight tags (matches the Paper SVG). */
function CheckGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="10"
      viewBox="0 0 10 10"
      width="10"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2 5L4 7L8 3" fill="none" stroke="#0E2235" strokeWidth="1.5" />
    </svg>
  );
}
