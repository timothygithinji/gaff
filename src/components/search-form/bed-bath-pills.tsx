/**
 * Bed + Bath segmented pickers.
 *
 * Each renders as a bordered white card with a small-caps label and a
 * row of equal-width segments — selected segment fills navy with white
 * text, the rest are mist on navy ink. Matches the Paper "Price & size"
 * BEDS / BATHS controls. Beds and baths are single-select; the DB
 * columns are `(min, max)` ints so each choice encodes a `(min, max)`.
 */
import { cn } from "../../lib/utils";

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
  { id: "1+", label: "1", min: 1, max: null },
  { id: "2+", label: "2", min: 2, max: null },
  { id: "3+", label: "3", min: 3, max: null },
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
    <div className="flex flex-1 flex-col gap-2 rounded-md border border-line bg-paper p-3.5">
      <p className="text-[10px] text-slate uppercase tracking-[0.14em]">
        {title}
      </p>
      <div className="flex gap-1">
        {options.map((opt) => {
          const active = opt.id === selectedId;
          return (
            <button
              className={cn(
                "flex-1 rounded-sm py-1.5 text-center text-[12px] leading-4",
                active
                  ? "bg-navy font-semibold text-[#eef1f4]"
                  : "bg-mist text-slate"
              )}
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
