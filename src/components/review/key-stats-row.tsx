/**
 * Three-column stat strip beneath the price + address. Beds · Bath · Sqft.
 *
 * Each cell:
 *   - Hugeicons stroke icon on the left.
 *   - Big number in Fraunces.
 *   - Tiny all-caps label below.
 *
 * `null` numbers render as "—" so the row still aligns.
 */
import {
  BedIcon,
  Bathtub02Icon,
  Maximize02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type IconRef = typeof BedIcon;

type Props = {
  bedrooms: number | null;
  bathrooms: number | null;
  /** Gross internal area in sq ft, if known. */
  sqft: number | null;
};

export function KeyStatsRow({ bedrooms, bathrooms, sqft }: Props) {
  return (
    <dl className="grid grid-cols-3 gap-3 border-border border-y py-3">
      <Stat icon={BedIcon} value={bedrooms} label="Beds" />
      <Stat icon={Bathtub02Icon} value={bathrooms} label="Bath" />
      <Stat icon={Maximize02Icon} value={sqft} label="Sq ft" />
    </dl>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: IconRef;
  value: number | null;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <HugeiconsIcon
        className="text-muted-foreground"
        icon={icon}
        size={20}
        strokeWidth={1.6}
      />
      <div className="leading-tight">
        <dt className="sr-only">{label}</dt>
        <dd className="font-serif text-foreground text-xl">
          {value === null ? "—" : value}
        </dd>
        <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
      </div>
    </div>
  );
}
