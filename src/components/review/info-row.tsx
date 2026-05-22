/**
 * Four-column meta strip — Commute · Walk · EPC · Fibre.
 *
 * Lives below the feature pills. Each cell has a tiny eyebrow label
 * (copper, all-caps) and a chunky Fraunces value. Missing values render
 * as "—" so the row stays aligned even with sparse enrichment data.
 */

type Props = {
  commuteMinutes: number | null;
  walkMinutes: number | null;
  epcRating: string | null;
  broadbandMbps: number | null;
};

export function InfoRow({
  commuteMinutes,
  walkMinutes,
  epcRating,
  broadbandMbps,
}: Props) {
  return (
    <dl className="grid grid-cols-4 gap-2 border-brass/15 border-b py-3">
      <Cell
        glyph="↦"
        eyebrow="Commute"
        value={commuteMinutes === null ? "—" : `${commuteMinutes}`}
        unit={commuteMinutes === null ? "" : "min"}
      />
      <Cell
        glyph="⌒"
        eyebrow="Walk"
        value={walkMinutes === null ? "—" : `${walkMinutes}`}
        unit={walkMinutes === null ? "" : "min walk"}
      />
      <Cell glyph="⚡" eyebrow="EPC" value={epcRating ?? "—"} unit="" />
      <Cell
        glyph="◉"
        eyebrow="Fibre"
        value={broadbandMbps === null ? "—" : `${broadbandMbps}`}
        unit={broadbandMbps === null ? "" : "Mb"}
      />
    </dl>
  );
}

function Cell({
  glyph,
  eyebrow,
  value,
  unit,
}: {
  glyph: string;
  eyebrow: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="leading-tight">
      <p className="font-medium text-[10px] text-copper uppercase tracking-wider">
        <span aria-hidden className="mr-1">
          {glyph}
        </span>
        {eyebrow}
      </p>
      <p className="mt-1">
        <span className="font-serif text-ink text-lg">{value}</span>
        {unit ? <span className="ml-1 text-brass text-xs">{unit}</span> : null}
      </p>
    </div>
  );
}
