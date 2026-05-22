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

type Props = {
  /** Lat/lng come from property_clusters as numeric strings ("51.123456"). */
  lat: string | null;
  lng: string | null;
  /** Pretty title — e.g. "Belsize Park, NW3". */
  title: string;
  /** Eyebrow — e.g. "Where it sits". */
  eyebrow?: string;
  commuteMinutes?: Record<CommuteTargetLabel, Minutes>;
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
        <span className="font-semibold text-[10px] text-brass uppercase tracking-[0.12em]">
          {eyebrow}
        </span>
        <h2 className="font-medium font-serif text-[22px] text-ink leading-[130%] tracking-[-0.02em]">
          {title}
        </h2>
      </header>

      <div className="relative h-40 w-full overflow-hidden rounded-[14px] bg-[#E8E1D1]">
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
            <p className="text-brass text-sm">Location pending</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#E5DDD0] bg-[#FDFAF4] px-4 py-3.5">
        {headline ? (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[11px] text-brass uppercase leading-[115%] tracking-[0.08em]">
                To {headline[0]}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-medium font-serif text-[24px] text-ink leading-[115%] tracking-[-0.02em]">
                  {headline[1]}
                </span>
                <span className="font-medium text-[12px] text-brass leading-[115%]">
                  min
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-semibold text-[11px] text-brass uppercase leading-[115%] tracking-[0.08em]">
                Commute
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-medium font-serif text-[24px] text-ink leading-[115%] tracking-[-0.02em]">
                  —
                </span>
                <span className="font-medium text-[12px] text-brass leading-[115%]">
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
                className="flex items-center gap-1.5 rounded-md bg-[#F4EFE6] px-2 py-1"
                key={label}
              >
                <span className="font-medium text-[11px] text-ink">
                  {label} · {mins}m
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
