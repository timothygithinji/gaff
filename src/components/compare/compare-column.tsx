/**
 * One column of the side-by-side `/compare` view.
 *
 * Designed for fast scanning when deciding between two shortlisted
 * properties — strips the listing-detail page down to the facts that
 * actually change a decision: hero photo, headline price + address,
 * the consolidated cost breakdown, highlights / watchouts at a
 * glance, the key public records (EPC, broadband, crime relative to
 * the area baseline), and the nearest-station travel times.
 *
 * Reuses the persisted `ListingDetailPayload` from `getListingDetail`
 * — no new server function needed; the `/compare` route just runs
 * two queries in parallel.
 */

import { Link } from "@tanstack/react-router";
import type {
  ListingDetailHighlight,
  ListingDetailPayload,
  ListingDetailStationRoute,
  ListingDetailWatchout,
} from "../../server/functions/listing-detail";
import { CostsCard } from "../listing-detail/costs";

type Props = {
  /** Side label ("A" / "B") rendered as the column eyebrow. */
  side: string;
  data: ListingDetailPayload;
};

export function CompareColumn({ side, data }: Props) {
  const {
    cluster,
    headline,
    photos,
    summary,
    highlights,
    watchouts,
    epc,
    publicRecords,
    stationRoutes,
    fineprint,
  } = data;
  const heroPhoto = photos[0];
  return (
    <article className="flex flex-col gap-3.5">
      <header className="flex items-baseline justify-between">
        <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          {side}
        </span>
        <Link
          className="text-[12px] text-primary hover:underline"
          params={{ clusterId: cluster.id }}
          search={{ from: "compare" }}
          to="/listings/$clusterId"
        >
          Open full listing →
        </Link>
      </header>

      {heroPhoto ? (
        <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-muted">
          {/* biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. */}
          <img
            alt={headline.addressRaw}
            className="h-full w-full object-cover"
            src={heroPhoto.url}
          />
        </div>
      ) : (
        <div className="flex h-44 w-full items-center justify-center rounded-2xl bg-muted">
          <span className="text-muted-foreground text-xs">No photos</span>
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <span className="font-medium font-serif text-[28px] text-foreground leading-none tracking-tight">
          {headline.priceMonthly !== null
            ? `£${headline.priceMonthly.toLocaleString("en-GB")}`
            : "£—"}
          <span className="ml-1 text-[12px] text-muted-foreground">/mo</span>
        </span>
        <h2 className="font-serif text-[18px] text-foreground">
          {headline.addressRaw}
        </h2>
        {summary ? (
          <p className="mt-1 text-[13px] text-muted-foreground">{summary}</p>
        ) : null}
      </div>

      <CostsCard
        fineprint={fineprint}
        priceMonthly={headline.priceMonthly}
      />

      <VerdictsBlock
        highlights={highlights}
        watchouts={watchouts}
      />

      <KeyStats
        crime={publicRecords?.crime}
        broadband={publicRecords?.broadband}
        epcRating={epc?.rating ?? null}
      />

      <StationsBlock routes={stationRoutes} />
    </article>
  );
}

/**
 * Compact highlight/watchout chip row. Caps at 3 of each to keep the
 * column scannable — anyone wanting the full lists clicks 'Open full
 * listing'.
 */
function VerdictsBlock({
  highlights,
  watchouts,
}: {
  highlights: ListingDetailHighlight[];
  watchouts: ListingDetailWatchout[];
}) {
  if (highlights.length === 0 && watchouts.length === 0) {
    return null;
  }
  const topHighlights = highlights.slice(0, 3);
  const topWatchouts = watchouts.slice(0, 3);
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Stands out
      </span>
      {topHighlights.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {topHighlights.map((h) => (
            <li
              className="rounded-full bg-[#5D7A4A]/15 px-2.5 py-1 text-[11px] text-foreground"
              key={h.label}
            >
              {h.label}
            </li>
          ))}
        </ul>
      ) : null}
      {topWatchouts.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {topWatchouts.map((w) => (
            <li
              className={`rounded-full px-2.5 py-1 text-[11px] text-foreground ${
                w.severity === "problem"
                  ? "bg-[#B26B3F]/20"
                  : "bg-[#B26B3F]/10"
              }`}
              key={w.label}
            >
              {w.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function KeyStats({
  crime,
  broadband,
  epcRating,
}: {
  crime: NonNullable<ListingDetailPayload["publicRecords"]>["crime"];
  broadband: NonNullable<ListingDetailPayload["publicRecords"]>["broadband"];
  epcRating: string | null;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Key stats
      </span>
      <dl className="flex flex-col gap-1.5 text-[13px]">
        <Stat label="EPC" value={epcRating ?? "Pending"} />
        <Stat
          label="Broadband"
          value={
            broadband
              ? `${broadband.technology ?? "—"} · ${broadband.downloadMbps ?? "?"} Mbps`
              : "Pending"
          }
        />
        <Stat
          label="Crime"
          value={crime ? `${crime.total} in 1mi` : "Pending"}
          sub={crime?.comparison?.label}
        />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-col items-end">
        <span className="font-medium text-foreground">{value}</span>
        {sub ? <span className="text-[11px] text-muted-foreground">{sub}</span> : null}
      </dd>
    </div>
  );
}

function StationsBlock({
  routes,
}: {
  routes: ListingDetailStationRoute[] | undefined;
}) {
  if (!routes || routes.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Nearest station{routes.length === 1 ? "" : "s"}
      </span>
      <ul className="flex flex-col gap-1.5">
        {routes.map((route) => (
          <li
            className="flex items-baseline justify-between gap-3 text-[13px]"
            key={route.name}
          >
            <span className="min-w-0 truncate font-medium text-foreground">
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
    </section>
  );
}
