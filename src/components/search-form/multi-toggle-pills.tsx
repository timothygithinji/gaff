/**
 * Generic multi-select pill group used by the search form's
 * must-haves, exclusions, and property-type controls. Each of those is
 * the same flex-wrapped row of toggle buttons over a fixed option list
 * — only the option values and labels differ — so the behaviour and
 * styling live here once.
 */

export type TogglePillOption<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  options: TogglePillOption<T>[];
  value: T[];
  onChange: (next: T[]) => void;
};

export function MultiTogglePills<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const toggle = (id: T) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.includes(opt.id);
        return (
          <button
            className={
              active
                ? "rounded-full bg-navy px-3.5 py-1.5 font-medium text-[#eef1f4] text-[12px]"
                : "rounded-full border border-line bg-paper px-3.5 py-1.5 text-[12px] text-navy"
            }
            key={opt.id}
            onClick={() => toggle(opt.id)}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
