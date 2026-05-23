/**
 * Multi-toggle pills for hard "must have" amenity filters.
 *
 * Stored on `searches.mustHaves` as `text[]` and enforced through a
 * Zod enum in `src/server/functions/searches.ts`. Per-portal mapping
 * lives in `src/lib/portal-urls.ts`:
 *   - Rightmove: `garden`, `parking` → `mustHave=garden,parking`.
 *     `pets` falls through to parser-side filtering.
 *   - Zoopla: no URL support — all three are parser-side filters.
 *   - OpenRent: each becomes its own param (`garden=true`, etc.).
 *
 * Empty array = no filter.
 */

export type MustHaveValue = "garden" | "parking" | "pets";

const OPTIONS: { id: MustHaveValue; label: string }[] = [
  { id: "garden", label: "Garden" },
  { id: "parking", label: "Parking" },
  { id: "pets", label: "Pets OK" },
];

type Props = {
  value: MustHaveValue[];
  onChange: (next: MustHaveValue[]) => void;
};

export function MustHavesToggles({ value, onChange }: Props) {
  const toggle = (id: MustHaveValue) => {
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
