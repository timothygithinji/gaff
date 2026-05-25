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

import {
  MultiTogglePills,
  type TogglePillOption,
} from "./multi-toggle-pills";

const OPTIONS: TogglePillOption<string>[] = [
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
  return <MultiTogglePills onChange={onChange} options={OPTIONS} value={value} />;
}
