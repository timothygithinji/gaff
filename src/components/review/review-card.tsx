/**
 * The main review card. Composes:
 *
 *   - Full-bleed hero photo (R2 key if present, else portal URL).
 *   - "ALSO ON …" badge top-left over the hero.
 *   - Page indicator bottom-right (`1 / N`).
 *   - "Floor plan" pill bottom-left (opens features.floorplan link if any).
 *   - Price (`£2,450 /mo`) in Fraunces serif, big.
 *   - "CHEAPEST ON <portal>" right-aligned, copper.
 *   - Address: title + outcode/age sub.
 *   - Beds · Bath · Sqft three-column row.
 *   - Feature pills row (filtered by `aiRules`).
 *   - Commute · Walk · EPC · Fibre four-column row.
 *
 * The component is presentational — swipe actions live on the parent
 * route which wires the mutations.
 */
import type { Features } from "../../lib/ai/prompt";
import type { ReviewCard as ReviewCardData } from "../../server/functions/review";
import type { StoredAiRules } from "../../server/functions/searches";
import { FeaturePills } from "./feature-pills";
import { InfoRow } from "./info-row";
import { KeyStatsRow } from "./key-stats-row";

type Props = {
  card: ReviewCardData;
  aiRules: StoredAiRules;
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

/**
 * `Features.floorplan.giaSqm` is in m². The design displays sq ft.
 * Convert; round to the nearest 10 sq ft so we don't surface a fake-
 * precise decimal.
 */
function sqftFromGia(features?: Features): number | null {
  const gia = features?.floorplan?.giaSqm;
  if (!gia) {
    return null;
  }
  return Math.round((gia * 10.7639) / 10) * 10;
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

export function ReviewCardView({ card, aiRules }: Props) {
  const { headlineListing: hl, portalsAlsoOn, features, epcRating } = card;
  const heroPhoto = hl.photos[0];
  const photoCount = Math.max(hl.photos.length, 1);

  const alsoOnLabel =
    portalsAlsoOn.length > 0
      ? `ALSO ON ${portalsAlsoOn
          .map((p) => portalLabel(p.portal).toUpperCase())
          .join(" · ")}`
      : null;

  const sqft = sqftFromGia(features);

  // Walk minutes / commute minutes / broadband all come from features
  // when present. The schema's `commuteMinutes` is keyed by label so we
  // peek at the first value — PR 9 will let the user select the target.
  const commuteMinutes = pickFirstCommuteValue(features);
  const broadbandMbps = parseBroadbandMbps(features?.broadband);

  return (
    <article className="mx-4 overflow-hidden rounded-2xl bg-paper">
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        {heroPhoto ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available. Photo URLs already point at R2 with cache-friendly headers.
          <img
            alt={hl.title}
            className="h-full w-full object-cover"
            src={heroPhoto}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-bone">
            <p className="text-brass text-sm">No photo yet</p>
          </div>
        )}
        {alsoOnLabel ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 font-medium text-[10px] text-bone uppercase tracking-wider backdrop-blur">
            {alsoOnLabel}
          </span>
        ) : null}
        <span className="absolute right-3 bottom-3 rounded-full bg-ink/60 px-3 py-1 text-[10px] text-bone backdrop-blur">
          1 / {photoCount}
        </span>
        <button
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-paper/90 px-3 py-1 font-medium text-[11px] text-ink"
          type="button"
        >
          <span aria-hidden>▤</span>
          Floor plan
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif text-3xl text-ink leading-none">
            {formatPrice(hl.priceMonthly)}
            <span className="ml-1 font-sans text-brass text-sm">/mo</span>
          </p>
          <div className="text-right leading-tight">
            <p className="font-medium text-[10px] text-brass uppercase tracking-wider">
              Cheapest on
            </p>
            <p className="font-medium text-copper">{portalLabel(hl.portal)}</p>
          </div>
        </div>

        <div>
          <h2 className="font-serif text-2xl text-ink">{hl.addressRaw}</h2>
          <p className="mt-1 text-brass text-sm">
            {hl.outcode || "—"} · Listed via {portalLabel(hl.portal)}
          </p>
        </div>

        <KeyStatsRow
          bathrooms={hl.bathrooms}
          bedrooms={hl.bedrooms}
          sqft={sqft}
        />

        <FeaturePills aiRules={aiRules} features={features} />

        <InfoRow
          broadbandMbps={broadbandMbps}
          commuteMinutes={commuteMinutes}
          epcRating={epcRating ?? null}
          walkMinutes={null}
        />
      </div>
    </article>
  );
}

/**
 * `enrichments.commuteMinutes` is `Record<string, number>` keyed by the
 * commute-target label. The review card receives features but not
 * commute minutes today — leave null until PR 9 plumbs it through.
 * `_features` is referenced in the signature to keep the function
 * documentation honest about where commute will eventually flow from.
 */
function pickFirstCommuteValue(_features?: Features): number | null {
  return null;
}

const BROADBAND_NUMBER_RE = /(\d+)/;

/**
 * Parse a broadband string like "900 Mb FTTP" → 900. Falls back to
 * null when the AI returned something we can't parse.
 */
function parseBroadbandMbps(broadband?: string | null): number | null {
  if (!broadband) {
    return null;
  }
  const match = broadband.match(BROADBAND_NUMBER_RE);
  if (!match) {
    return null;
  }
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}
