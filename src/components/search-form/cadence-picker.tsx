/**
 * Re-scrape cadence picker.
 *
 * A segmented control matching the Paper "Re-scrape" card: equal-width
 * segments (1 hr · 4 hr · 12 hr · Daily · Off), selected fills navy.
 * The "Off" segment is the explicit pause sentinel (`cron: null`).
 *
 * The estimate line beneath ("Est. cost · $X/day") is rendered by the
 * form's cost panel, so this control stays focused on the choice.
 */
import { CADENCE_PRESETS, findCadenceById } from "../../lib/cron-presets";
import { cn } from "../../lib/utils";

/** Segments shown in the picker, in display order, with short labels. */
const SEGMENTS: Array<{ id: string; label: string }> = [
  { id: "hourly", label: "1 hr" },
  { id: "4h", label: "4 hr" },
  { id: "12h", label: "12 hr" },
  { id: "daily", label: "Daily" },
  { id: "off", label: "Off" },
];

type Props = {
  selectedId: string;
  onChange: (id: string) => void;
};

export function CadencePicker({ selectedId, onChange }: Props) {
  // Snap any cadence outside the segment set (e.g. legacy 6h / 2h rows)
  // to the closest visible segment so the control always shows a pick.
  const visibleId = SEGMENTS.some((s) => s.id === selectedId)
    ? selectedId
    : nearestSegment(selectedId);

  return (
    <div className="flex gap-1.5">
      {SEGMENTS.map((seg) => {
        const active = seg.id === visibleId;
        return (
          <button
            className={cn(
              "flex-1 rounded-sm py-2 text-center text-[12px] leading-4",
              active
                ? "bg-primary font-semibold text-[#eef1f4]"
                : "bg-mist text-slate"
            )}
            key={seg.id}
            onClick={() => onChange(seg.id)}
            type="button"
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

function nearestSegment(id: string): string {
  const preset = findCadenceById(id);
  if (preset.cron === null) {
    return "off";
  }
  // Map by scrapes-per-day to the closest visible segment.
  const visible = CADENCE_PRESETS.filter((p) =>
    SEGMENTS.some((s) => s.id === p.id)
  );
  let best = visible[0];
  for (const p of visible) {
    if (
      best &&
      Math.abs(p.scrapesPerDay - preset.scrapesPerDay) <
        Math.abs(best.scrapesPerDay - preset.scrapesPerDay)
    ) {
      best = p;
    }
  }
  return best?.id ?? "daily";
}
