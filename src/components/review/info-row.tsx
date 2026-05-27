/**
 * Four-column meta strip — Commute · Walk · EPC · Fibre.
 *
 * Lives below the feature pills. Each cell has a tiny eyebrow label
 * (copper, all-caps) with a Hugeicons stroke icon and a chunky Fraunces
 * value. Missing values render as "—" so the row stays aligned even
 * with sparse enrichment data.
 *
 * `walkMinutes` is derived from the nearest scraped station's
 * `distanceMiles` (~20 min/mile). When we have a station name, the cell
 * subtitle shows it so the number isn't context-free.
 */
import {
  FlashIcon,
  Route01Icon,
  WalkingIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type IconRef = typeof FlashIcon;

type Props = {
  commuteMinutes: number | null;
  walkMinutes: number | null;
  stationName?: string | null;
  epcRating: string | null;
  /** Postcode-level estimate (no exact certificate match) — shown as "~C est". */
  epcIsEstimate?: boolean;
  broadbandMbps: number | null;
};

export function InfoRow({
  commuteMinutes,
  walkMinutes,
  stationName,
  epcRating,
  epcIsEstimate,
  broadbandMbps,
}: Props) {
  return (
    <dl className="grid grid-cols-4 gap-2 border-border border-b py-3">
      <Cell
        icon={Route01Icon}
        eyebrow="Commute"
        value={commuteMinutes === null ? "—" : `${commuteMinutes}`}
        unit={commuteMinutes === null ? "" : "min"}
      />
      <Cell
        icon={WalkingIcon}
        eyebrow={stationName ? `to ${stationName}` : "Walk"}
        value={walkMinutes === null ? "—" : `${walkMinutes}`}
        unit={walkMinutes === null ? "" : "min walk"}
      />
      <Cell
        icon={FlashIcon}
        eyebrow="EPC"
        value={epcRating ? (epcIsEstimate ? `~${epcRating}` : epcRating) : "—"}
        unit={epcRating && epcIsEstimate ? "est" : ""}
      />
      <Cell
        icon={Wifi01Icon}
        eyebrow="Fibre"
        value={broadbandMbps === null ? "—" : `${broadbandMbps}`}
        unit={broadbandMbps === null ? "" : "Mb"}
      />
    </dl>
  );
}

function Cell({
  icon,
  eyebrow,
  value,
  unit,
}: {
  icon: IconRef;
  eyebrow: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="leading-tight">
      <p className="flex items-center gap-1 font-medium text-[10px] text-primary uppercase tracking-wider">
        <HugeiconsIcon icon={icon} size={12} strokeWidth={2} />
        <span className="truncate">{eyebrow}</span>
      </p>
      <p className="mt-1">
        <span className="font-serif text-foreground text-lg">{value}</span>
        {unit ? (
          <span className="ml-1 text-muted-foreground text-xs">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}
