/**
 * Time-of-day picker for anchored re-scrape cadences.
 *
 * Shown beneath the CadencePicker only when the chosen cadence runs at a
 * fixed hour ("Daily", "Every 12h"). The user picks the anchor hour; the
 * form composes it into the cron via `buildCron`. For "Every 12h" the
 * caption spells out both fire times (H and H+12) so the pick is legible.
 */

/** 12-hour clock label, e.g. 7 → "7am", 0 → "12am", 13 → "1pm". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

type Props = {
  value: number;
  onChange: (hour: number) => void;
  /** The selected cadence id — drives the caption (12h shows both times). */
  cadenceId: string;
};

export function TimeOfDayPicker({ value, onChange, cadenceId }: Props) {
  const caption =
    cadenceId === "12h"
      ? `Runs at ${formatHour(value)} & ${formatHour(value + 12)}`
      : `Runs at ${formatHour(value)}`;

  return (
    <div className="mt-2.5 flex items-center justify-between gap-3">
      <span className="text-[12px] text-slate">{caption}</span>
      <select
        aria-label="Time of day"
        className="rounded-sm border border-line bg-paper px-2 py-1.5 text-[12px] text-navy outline-none focus:border-slate-2"
        onChange={(e) => onChange(Number(e.target.value))}
        value={value}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {formatHour(h)}
          </option>
        ))}
      </select>
    </div>
  );
}
