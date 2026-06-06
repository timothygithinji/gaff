import type { ReviewCard } from "../../server/functions/review";
/**
 * Pure ReviewCard → display shapers, called by BOTH the desktop and mobile
 * review trees so a card shows the same data on every device. This is where
 * the 4-vs-2 stat drift used to live (desktop's buildStats vs mobile's inline
 * CardStats); now there's one source.
 */
import type { StatCell } from "../ui/patterns/stat-row";

/**
 * The canonical review stat set: Transport · EPC · Council tax · Size.
 * (Commute-to-targets was dropped in favour of nearest-station Transport,
 * which is always enriched — see docs/device-parity-plan.md.)
 */
export function toStatCells(card: ReviewCard): StatCell[] {
  return [
    transportStat(card),
    epcStat(card.epcRating),
    {
      label: "Council tax",
      value: card.councilTaxBand ?? "—",
      sub: card.councilTaxBand ? "band" : undefined,
    },
    sizeStat(card),
  ];
}

function transportStat(card: ReviewCard): StatCell {
  const station = card.nearestStation;
  if (station?.walkMinutes != null) {
    return {
      label: "Transport",
      value: `${station.walkMinutes}`,
      unit: "min",
      sub: station.name,
    };
  }
  return { label: "Transport", value: "—", sub: station?.name ?? undefined };
}

/** EPC band, tinted: A–C good, D neutral, E–G bad. */
function epcStat(rating: string | undefined): StatCell {
  if (!rating) {
    return { label: "EPC", value: "—", tone: "neutral" };
  }
  const band = rating.trim().toUpperCase().charAt(0);
  let tone: StatCell["tone"] = "neutral";
  if ("ABC".includes(band)) {
    tone = "good";
  } else if ("EFG".includes(band)) {
    tone = "bad";
  }
  return { label: "EPC", value: rating, tone };
}

/** Floor area in sq ft, falling back to the EPC certificate's area. */
function sizeStat(card: ReviewCard): StatCell {
  const sqft = card.headlineListing.sizeSqFt ?? card.epcFloorAreaSqFt ?? null;
  if (sqft == null) {
    return { label: "Size", value: "—" };
  }
  return { label: "Size", value: sqft.toLocaleString("en-GB"), unit: "sq ft" };
}
