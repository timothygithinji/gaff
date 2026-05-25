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

import {
  MultiTogglePills,
  type TogglePillOption,
} from "./multi-toggle-pills";

export type MustHaveValue = "garden" | "parking" | "pets";

const OPTIONS: TogglePillOption<MustHaveValue>[] = [
  { id: "garden", label: "Garden" },
  { id: "parking", label: "Parking" },
  { id: "pets", label: "Pets OK" },
];

type Props = {
  value: MustHaveValue[];
  onChange: (next: MustHaveValue[]) => void;
};

export function MustHavesToggles({ value, onChange }: Props) {
  return <MultiTogglePills onChange={onChange} options={OPTIONS} value={value} />;
}
