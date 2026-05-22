/**
 * Bed + Bath pill groups.
 *
 * Each group is a row of pill-shaped buttons; the selected pill flips
 * to ink-on-bone (high contrast) to match the artboard. Beds and baths
 * are intentionally one-of-many in v1 — the design uses single-select
 * pills, and the DB columns are `(min, max)` ints, so we encode each
 * choice as a `(min, max)` pair.
 */

export type BedOption = {
  id: string;
  label: string;
  min: number;
  max: number | null;
};
export type BathOption = {
  id: string;
  label: string;
  min: number;
  max: number | null;
};

export const BED_OPTIONS: BedOption[] = [
  { id: "1", label: "1", min: 1, max: 1 },
  { id: "2", label: "2", min: 2, max: 2 },
  { id: "3", label: "3", min: 3, max: 3 },
  { id: "4+", label: "4+", min: 4, max: null },
];

export const BATH_OPTIONS: BathOption[] = [
  { id: "1+", label: "1+", min: 1, max: null },
  { id: "2", label: "2", min: 2, max: 2 },
  { id: "3+", label: "3+", min: 3, max: null },
];

type Props<T extends { id: string; label: string }> = {
  title: string;
  options: T[];
  selectedId: string;
  onChange: (id: string) => void;
};

export function PillGroup<T extends { id: string; label: string }>({
  title,
  options,
  selectedId,
  onChange,
}: Props<T>) {
  return (
    <div className="flex-1 rounded-2xl bg-bone px-5 py-4">
      <p className="mb-3 text-[11px] text-brass uppercase tracking-[0.14em]">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt.id === selectedId;
          return (
            <button
              className={
                active
                  ? "flex h-9 min-w-9 items-center justify-center rounded-full bg-ink px-3 font-medium text-bone text-sm"
                  : "flex h-9 min-w-9 items-center justify-center rounded-full bg-paper px-3 text-brass text-sm"
              }
              key={opt.id}
              onClick={() => onChange(opt.id)}
              type="button"
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
