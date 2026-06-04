/**
 * "Where it sits" — Google Maps Embed iframe + commute card.
 *
 * Embed API docs: https://developers.google.com/maps/documentation/embed/embedding-map
 * We use `place` mode with the cluster's lat/lng as the query, dropping a
 * single pin at the centre.
 *
 * The commute card pulls from `enrichments.commuteMinutes`. When no
 * commute data is available we render a single muted row.
 *
 * Paper (mobile 2T3-0 "Where it sits"): slate eyebrow, then a single
 * white card (radius 6, hairline) whose top half is a 160px map and whose
 * bottom half is the headline commute (22px figure + "min" sub) with the
 * remaining targets as mist/navy pills on the right.
 */
import { SectionLabel } from "./section-label";

type CommuteTargetLabel = string;
type Minutes = number;

export type WhereItSitsStationRoute = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
};

export type WhereItSitsTransitKind = "tube" | "rail" | "tram" | "bus";

export type WhereItSitsPlaceCategory =
  | "transport"
  | "park"
  | "shop"
  | "gp"
  | "restaurant";

export type WhereItSitsNearbyTransit = {
  name: string;
  category: WhereItSitsPlaceCategory;
  kind: WhereItSitsTransitKind | null;
  lat: number;
  lng: number;
  distanceMiles: number;
};

type Props = {
  /** Lat/lng come from property_clusters as numeric strings ("51.123456"). */
  lat: string | null;
  lng: string | null;
  /** Pretty title — e.g. "Hartley Mews, NW3". */
  title: string;
  /** Eyebrow — e.g. "Where it sits". */
  eyebrow?: string;
  commuteMinutes?: Record<CommuteTargetLabel, Minutes>;
  /**
   * Realistic walking + transit minutes to the cluster's nearest
   * stations, computed via Google Routes at enrichment time.
   */
  stationRoutes?: WhereItSitsStationRoute[];
  /**
   * Every relevant place within ~1 mile (transport / parks / shops / GPs
   * / restaurants), from the Google Places sweep. Listed nearest-first.
   */
  nearbyTransit?: WhereItSitsNearbyTransit[];
  /** Google Maps Embed API key. */
  apiKey: string;
};

const CATEGORY_DOT: Record<WhereItSitsPlaceCategory, string> = {
  transport: "bg-[#1f4e79]",
  park: "bg-[#2e7d52]",
  shop: "bg-[#b07a2c]",
  gp: "bg-[#b3453a]",
  restaurant: "bg-[#d77a4a]",
};

const CATEGORY_LABEL: Record<WhereItSitsPlaceCategory, string> = {
  transport: "Transport",
  park: "Park",
  shop: "Shop",
  gp: "GP",
  restaurant: "Food",
};

function parseCoord(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function WhereItSits({
  lat,
  lng,
  eyebrow = "Where it sits",
  commuteMinutes,
  stationRoutes,
  nearbyTransit,
  apiKey,
}: Props) {
  const latNum = parseCoord(lat);
  const lngNum = parseCoord(lng);
  const hasCoords = latNum !== null && lngNum !== null;

  const mapSrc =
    hasCoords && apiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${latNum},${lngNum}&zoom=15`
      : null;

  const commuteEntries = commuteMinutes ? Object.entries(commuteMinutes) : [];
  const headline = commuteEntries[0];
  const restCount = Math.max(commuteEntries.length - 1, 0);

  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>{eyebrow}</SectionLabel>

      <div className="flex flex-col overflow-hidden rounded-md border border-line bg-card">
        <div className="relative h-40 shrink-0 overflow-hidden bg-[#d7e0e6]">
          {mapSrc ? (
            <iframe
              allowFullScreen={false}
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapSrc}
              title={eyebrow}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-[12px] text-slate-2">Location pending</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4">
          {headline ? (
            <div className="flex flex-col gap-0.5">
              <span className="font-normal text-[11px] text-slate uppercase tracking-[0.12em]">
                To {headline[0]}
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-medium text-[22px] text-foreground leading-7">
                  {headline[1]}
                </span>
                <span className="text-[11px] text-slate">min</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="font-normal text-[11px] text-slate uppercase tracking-[0.12em]">
                Commute
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-medium text-[22px] text-foreground leading-7">
                  —
                </span>
                <span className="text-[11px] text-slate">not run yet</span>
              </div>
            </div>
          )}

          {restCount > 0 ? (
            <span className="rounded-full bg-mist px-2 py-1 text-[11px] text-slate">
              +{restCount} more
            </span>
          ) : null}
        </div>
      </div>

      <StationRoutesPanel routes={stationRoutes} />
      <NearbyTransitPanel stops={nearbyTransit} />
    </section>
  );
}

/**
 * Every relevant place within ~1 mile, nearest-first. The mobile map is a
 * static iframe (no on-demand routing like the desktop card), so this is a
 * plain distance-labelled list. Renders nothing until the Places sweep has
 * populated it.
 */
function NearbyTransitPanel({
  stops,
}: {
  stops: WhereItSitsNearbyTransit[] | undefined;
}) {
  if (!stops || stops.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
      <SectionLabel>What's within 1 mile</SectionLabel>
      <ul className="flex flex-col gap-2">
        {stops.map((stop) => (
          <li
            className="flex items-center justify-between gap-3"
            key={`${stop.name}-${stop.lat}-${stop.lng}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`size-2 shrink-0 rounded-full ${CATEGORY_DOT[stop.category]}`}
              />
              <span className="min-w-0 truncate font-medium text-[13px] text-foreground">
                {stop.name}
              </span>
            </span>
            <span className="shrink-0 text-[11px] text-slate">
              {CATEGORY_LABEL[stop.category]} ·{" "}
              <span className="font-semibold text-foreground">
                {stop.distanceMiles.toFixed(1)}
              </span>{" "}
              mi
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Walking + transit minutes to each of the cluster's nearest stations.
 * Renders nothing when the enrichment hasn't run.
 */
function StationRoutesPanel({
  routes,
}: {
  routes: WhereItSitsStationRoute[] | undefined;
}) {
  if (!routes || routes.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-card p-4">
      <SectionLabel>
        Directions to nearest station{routes.length === 1 ? "" : "s"}
      </SectionLabel>
      <ul className="flex flex-col gap-2">
        {routes.map((route) => (
          <li
            className="flex items-baseline justify-between gap-3"
            key={route.name}
          >
            <span className="min-w-0 truncate font-medium text-[13px] text-foreground">
              {route.name}
            </span>
            <StationTimes route={route} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Walk / transit minute chips for one station row. Each leg is
 * independently nullable; the middle dot only shows when both are set. */
function StationTimes({ route }: { route: WhereItSitsStationRoute }) {
  const legs: string[] = [];
  if (route.walkMinutes != null) {
    legs.push(`${route.walkMinutes} min walk`);
  }
  if (route.transitMinutes != null) {
    legs.push(`${route.transitMinutes} min bus`);
  }
  return (
    <span className="shrink-0 text-[11px] text-slate">
      {legs.map((leg, i) => {
        const [value, ...rest] = leg.split(" ");
        return (
          <span key={leg}>
            {i > 0 ? <span className="mx-1 text-slate-2">·</span> : null}
            <span className="font-semibold text-foreground">{value}</span>{" "}
            {rest.join(" ")}
          </span>
        );
      })}
    </span>
  );
}
