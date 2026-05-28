/**
 * The main review card. Composes:
 *
 *   - Full-bleed hero photo (R2 key if present, else portal URL).
 *   - "ALSO ON …" badge top-left over the hero.
 *   - Page indicator bottom-right (`1 / N`).
 *   - "Floor plan" pill bottom-left — opens the scraped floor plan URL
 *     in a new tab when one was parsed for this listing.
 *   - Price (`£2,450 /mo`) in Fraunces serif, big.
 *   - "CHEAPEST ON <portal>" right-aligned, copper.
 *   - Address: title + outcode/age sub.
 *   - Beds · Bath · Sqft three-column row.
 *   - Highlights + watch-outs pills (from v2 features schema).
 *   - Commute · Walk · EPC · Fibre four-column row — every value
 *     sources from a typed enrichment, NOT the AI text extraction.
 */
import { FloorPlanIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  daysSince,
  deriveListingMetaBadges,
  formatDaysListed,
} from "../../lib/listing-meta";
import type { ReviewCard as ReviewCardData } from "../../server/functions/review";
import { FeaturePills } from "./feature-pills";
import { InfoRow } from "./info-row";
import { KeyStatsRow } from "./key-stats-row";
import { MetaBadges } from "./meta-badges";

type Props = {
  card: ReviewCardData;
};

/**
 * Human-readable price string. Returns "—" when the portal didn't
 * include a monthly price (rare — but Rightmove occasionally lists
 * "POA" properties).
 */
function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

/** Pretty portal name for badges and "CHEAPEST ON" tag. */
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

export function ReviewCardView({ card }: Props) {
  const {
    headlineListing: hl,
    portalsAlsoOn,
    features,
    epcRating,
    epcIsEstimate,
    commuteMinutes,
    nearestStation,
    broadband,
  } = card;
  const heroPhoto = hl.photos[0];
  const photoCount = Math.max(hl.photos.length, 1);

  const alsoOnLabel =
    portalsAlsoOn.length > 0
      ? `ALSO ON ${portalsAlsoOn
          .map((p) => portalLabel(p.portal).toUpperCase())
          .join(" · ")}`
      : null;

  // Prefer the portal's "first listed" date; fall back to our first-seen
  // for the ~half of listings missing publishedAt.
  const daysListed = daysSince(hl.publishedAt ?? hl.firstSeenAt);
  const listedLabel = formatDaysListed(daysListed);
  const metaBadges = deriveListingMetaBadges({
    tags: hl.tags,
    daysListed,
    listedBuilding: hl.listedBuilding,
    floodDisclosure: hl.floodDisclosure,
  });

  return (
    <article className="mx-4 overflow-hidden rounded-2xl bg-card">
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        {heroPhoto ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. Photo URLs already point at R2 with cache-friendly headers.
          <img
            alt={hl.title}
            className="h-full w-full object-cover"
            src={heroPhoto}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <p className="text-muted-foreground text-sm">No photo yet</p>
          </div>
        )}
        {alsoOnLabel ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/70 px-3 py-1 font-medium text-[10px] text-primary-foreground uppercase tracking-wider backdrop-blur">
            {alsoOnLabel}
          </span>
        ) : null}
        <span className="absolute right-3 bottom-3 rounded-full bg-foreground/60 px-3 py-1 text-[10px] text-primary-foreground backdrop-blur">
          1 / {photoCount}
        </span>
        {hl.floorplanUrl ? (
          <a
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1 font-medium text-[11px] text-foreground backdrop-blur"
            href={hl.floorplanUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <HugeiconsIcon icon={FloorPlanIcon} size={12} strokeWidth={2} />
            Floor plan
          </a>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif text-3xl text-foreground leading-none">
            {formatPrice(hl.priceMonthly)}
            <span className="ml-1 font-sans text-muted-foreground text-sm">
              /mo
            </span>
          </p>
          <div className="text-right leading-tight">
            <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
              Cheapest on
            </p>
            <p className="font-medium text-primary">{portalLabel(hl.portal)}</p>
          </div>
        </div>

        <div>
          <h2 className="font-serif text-2xl text-foreground">
            {hl.addressRaw}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {hl.outcode || "—"}
            {listedLabel ? ` · ${listedLabel}` : ""} · via{" "}
            {portalLabel(hl.portal)}
          </p>
        </div>

        <MetaBadges badges={metaBadges} />

        <KeyStatsRow
          bathrooms={hl.bathrooms}
          bedrooms={hl.bedrooms}
          sqft={hl.sizeSqFt}
        />

        <FeaturePills features={features} />

        <InfoRow
          broadbandMbps={broadband?.downloadMbps ?? null}
          commuteMinutes={commuteMinutes}
          epcIsEstimate={epcIsEstimate}
          epcRating={epcRating ?? null}
          stationName={nearestStation?.name ?? null}
          walkMinutes={nearestStation?.walkMinutes ?? null}
        />
      </div>
    </article>
  );
}
