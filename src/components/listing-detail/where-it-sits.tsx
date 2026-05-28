/**
 * "Where it sits" — Google Maps Embed iframe + commute card.
 *
 * Embed API docs: https://developers.google.com/maps/documentation/embed/embedding-map
 * We use the `place` mode with the cluster's lat/lng as the query, which
 * drops a single pin at the centre. The API key is the public
 * `GOOGLE_MAPS_API_KEY` env var (no referrer restrictions needed in v1).
 *
 * The commute card pulls from `enrichments.commuteMinutes`. When no
 * commute data is available — e.g. enrichment hasn't run, or the
 * search has no commute targets — we render a single muted dash row so
 * the section still surfaces.
 */
type CommuteTargetLabel = string;
type Minutes = number;

export type WhereItSitsStationRoute = {
  name: string;
  walkMinutes: number | null;
  transitMinutes: number | null;
};

type Props = {
  /** Lat/lng come from property_clusters as numeric strings ("51.123456"). */
  lat: string | null;
  lng: string | null;
  /** Pretty title — e.g. "Belsize Park, NW3". */
  title: string;
  /** Eyebrow — e.g. "Where it sits". */
  eyebrow?: string;
  commuteMinutes?: Record<CommuteTargetLabel, Minutes>;
  /**
   * Realistic walking + transit minutes to the cluster's nearest
   * stations, computed via Google Routes at enrichment time. Renders
   * below the commute card when present.
   */
  stationRoutes?: WhereItSitsStationRoute[];
  /** Google Maps Embed API key. */
  apiKey: string;
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
  title,
  eyebrow = "Where it sits",
  commuteMinutes,
  stationRoutes,
  apiKey,
}: Props) {
  const latNum = parseCoord(lat);
  const lngNum = parseCoord(lng);
  const hasCoords = latNum !== null && lngNum !== null;

  const mapSrc =
    hasCoords && apiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${latNum},${lngNum}&zoom=15`
      : null;

  // The commute card's "headline" is the first entry. If there are
  // multiple commute targets, the others render as smaller chips
  // beneath — for v1 we just show the headline.
  const commuteEntries = commuteMinutes ? Object.entries(commuteMinutes) : [];
  const headline = commuteEntries[0];

  return (
    <section className="flex flex-col gap-3.5 px-6 pt-7">
      <header className="flex flex-col gap-1">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          {eyebrow}
        </span>
        <h2 className="font-medium font-serif text-[22px] text-foreground leading-[130%] tracking-[-0.02em]">
          {title}
        </h2>
      </header>

      <div className="relative h-40 w-full overflow-hidden rounded-[14px] bg-muted">
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

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        {headline ? (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[11px] text-muted-foreground uppercase leading-[115%] tracking-[0.08em]">
                To {headline[0]}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-medium font-serif text-[24px] text-foreground leading-[115%] tracking-[-0.02em]">
                  {headline[1]}
                </span>
                <span className="font-medium text-[12px] text-muted-foreground leading-[115%]">
                  min
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[11px] text-muted-foreground uppercase leading-[115%] tracking-[0.08em]">
                Commute
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-medium font-serif text-[24px] text-foreground leading-[115%] tracking-[-0.02em]">
                  —
                </span>
                <span className="font-medium text-[12px] text-muted-foreground leading-[115%]">
                  not run yet
                </span>
              </div>
            </div>
          </div>
        )}

        {commuteEntries.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {commuteEntries.slice(1).map(([label, mins]) => (
              <div
                className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1"
                key={label}
              >
                <span className="font-medium text-[11px] text-foreground">
                  {label} · {mins}m
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <StationRoutesPanel routes={stationRoutes} />
    </section>
  );
}

/**
 * Walking + transit minutes to each of the cluster's nearest stations.
 * Renders nothing when the enrichment hasn't run (most non-Rightmove
 * clusters never get this populated, since only Rightmove parses
 * `nearestStations` from listing JSON).
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
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Directions to nearest station{routes.length === 1 ? "" : "s"}
      </span>
      <ul className="flex flex-col gap-2">
        {routes.map((route) => (
          <li
            className="flex items-baseline justify-between gap-3"
            key={route.name}
          >
            <span className="min-w-0 truncate font-medium text-[13px] text-foreground">
              {route.name}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-muted-foreground text-xs">
              {route.walkMinutes != null ? (
                <span>
                  <span className="font-semibold text-foreground">
                    {route.walkMinutes}
                  </span>{" "}
                  min walk
                </span>
              ) : null}
              {route.walkMinutes != null && route.transitMinutes != null ? (
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
              ) : null}
              {route.transitMinutes != null ? (
                <span>
                  <span className="font-semibold text-foreground">
                    {route.transitMinutes}
                  </span>{" "}
                  min bus
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
