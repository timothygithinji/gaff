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
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            className={
              active
                ? "rounded-full bg-foreground px-4 py-2 font-medium text-background text-sm"
                : "rounded-full bg-muted px-4 py-2 text-muted-foreground text-sm"
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
