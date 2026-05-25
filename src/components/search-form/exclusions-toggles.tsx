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

import {
  MultiTogglePills,
  type TogglePillOption,
} from "./multi-toggle-pills";

export type ExclusionValue = "student" | "retirement" | "house_share";

const OPTIONS: TogglePillOption<ExclusionValue>[] = [
  { id: "student", label: "Student accommodation" },
  { id: "retirement", label: "Retirement homes" },
  { id: "house_share", label: "House shares" },
];

type Props = {
  value: ExclusionValue[];
  onChange: (next: ExclusionValue[]) => void;
};

export function ExclusionsToggles({ value, onChange }: Props) {
  return <MultiTogglePills onChange={onChange} options={OPTIONS} value={value} />;
}
