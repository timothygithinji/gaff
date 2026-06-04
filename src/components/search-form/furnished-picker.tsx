/**
 * Single-select picker for the furnishing filter.
 *
 * `null` = no filter (default). `"furnished"` and `"unfurnished"` map
 * to portal-specific tokens in `src/lib/portal-urls.ts` (Rightmove
 * `furnishTypes`, Zoopla `furnished_state`, OpenRent `furnishing`).
 *
 * Mirrors the closed enum on `searches.furnished` and the Zod schema
 * in `src/server/functions/searches.ts`. Keep these three in sync.
 */

export type FurnishedValue = "furnished" | "unfurnished" | null;

const OPTIONS: { id: FurnishedValue; label: string }[] = [
  { id: null, label: "Any" },
  { id: "furnished", label: "Furnished" },
  { id: "unfurnished", label: "Unfurnished" },
];

type Props = {
  value: FurnishedValue;
  onChange: (next: FurnishedValue) => void;
};

export function FurnishedPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            className={
              active
                ? "rounded-full bg-primary px-3.5 py-1.5 font-medium text-[#eef1f4] text-[12px]"
                : "rounded-full border border-line bg-paper px-3.5 py-1.5 text-[12px] text-navy"
            }
            key={opt.id ?? "any"}
            onClick={() => onChange(opt.id)}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
