/**
 * Multi-select pill group for property types.
 *
 * Stored on `searches.propertyTypes` as `string[]`. Per-portal mapping
 * lives in `src/lib/portal-urls.ts`: Rightmove takes a comma list,
 * Zoopla picks the first as `property_sub_type`, OpenRent doesn't
 * accept it in the URL (parser-side filter).
 *
 * Empty array = "any" — no filter applied on any portal.
 */

const OPTIONS: { id: string; label: string }[] = [
  { id: "flat", label: "Flat" },
  { id: "house", label: "House" },
  { id: "bungalow", label: "Bungalow" },
  { id: "other", label: "Other" },
];

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function PropertyTypePills({ value, onChange }: Props) {
  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const active = value.includes(opt.id);
        return (
          <button
            className={
              active
                ? "rounded-full bg-foreground px-4 py-2 font-medium text-background text-sm"
                : "rounded-full bg-muted px-4 py-2 text-muted-foreground text-sm"
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
