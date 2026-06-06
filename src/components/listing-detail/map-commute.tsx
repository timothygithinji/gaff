/**
 * "Where it sits" — the interactive map + commute card, shared by the desktop
 * and mobile listing-detail (mobile previously had a static Google Maps Embed
 * iframe; it now gets the same interactive card — see docs/device-parity-plan.md).
 *
 * The map (`MapView`, Google Maps JS) is wrapped in `MountWhenVisible` so the
 * CSS-hidden device tree doesn't initialise a second map instance; it boots
 * only when its tree is the visible one.
 *
 * Every nearby place shows its colour by default (markers + chip dots);
 * routes are drawn on demand — tap a chip to draw its walking route and
 * compute the real walk/transit time.
 */
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import type {
  ListingDetailNearbyTransit,
  ListingDetailStationRoute,
} from "../../server/functions/listing-detail";
import { MountWhenVisible } from "../ui/patterns/mount-when-visible";
import { MapView, type RouteTimes, type TransitPoint } from "./map-view";
import { StationGlyphs } from "./transit-glyph";

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
const BRAND_DOMAINS: [RegExp, string][] = [
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

export function MapCommute({
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
          <HugeiconsIcon icon={MapsLocation01Icon} size={12} strokeWidth={1.8} />
          Open in Google Maps
        </a>
      </header>
      <div className="mx-6 aspect-[16/9] overflow-hidden rounded-md border border-line bg-[#d7e0e6] dark:bg-mist">
        {hasCoords ? (
          <MountWhenVisible
            className="h-full w-full"
            placeholder={
              <div className="flex h-full w-full items-center justify-center text-[13px] text-slate-2">
                Map loads when visible…
              </div>
            }
          >
            <MapView
              lat={latNum}
              lng={lngNum}
              onRouteComputed={handleRouteComputed}
              onTogglePoint={toggle}
              points={points}
              selectedIds={selectedIds}
              title={title}
            />
          </MountWhenVisible>
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
  let trailing: string | null = null;
  if (times) {
    trailing = formatRouteTimes(times);
  } else if (selected) {
    trailing = "routing…";
  }
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
