/**
 * Multi-toggle pills for listing categories to HIDE.
 *
 * Mirror of `MustHavesToggles` but inverted in intent — toggling
 * "Student accommodation" ON adds it to the exclusion list so the
 * scraper skips those listings.
 *
 * Stored on `searches.exclusions` as `text[]`. Per-portal mapping
 * lives in `src/lib/portal-urls.ts`:
 *   - Rightmove: `dontShow=studentLet,retirement,houseShare` (comma list)
 *   - Zoopla: `include_*=false` per category
 *   - OpenRent: no URL support — best-effort parser-side filter
 *
 * Empty array = no exclusions.
 */

export type ExclusionValue = "student" | "retirement" | "house_share";

const OPTIONS: { id: ExclusionValue; label: string }[] = [
  { id: "student", label: "Student accommodation" },
  { id: "retirement", label: "Retirement homes" },
  { id: "house_share", label: "House shares" },
];

type Props = {
  value: ExclusionValue[];
  onChange: (next: ExclusionValue[]) => void;
};

export function ExclusionsToggles({ value, onChange }: Props) {
  const toggle = (id: ExclusionValue) => {
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
