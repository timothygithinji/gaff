/**
 * The monthly-rent headline, shared by review and listing detail. Owns the
 * `formatPrice` helper that was copy-pasted into review-card and
 * desktop-listing-detail, and the price type scale:
 *   - `size="lg"` — 40px detail-page hero
 *   - `size="md"` — 22px card headline
 *
 * `layout="inline"` keeps the period suffix on the price baseline (detail
 * page); `layout="stacked"` drops it underneath, right-aligned (review card).
 */
import { cn } from "@/lib/utils";

export function formatPrice(monthly: number | null | undefined): string {
  if (monthly == null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

type PriceSize = "lg" | "md";

const SIZE: Record<PriceSize, string> = {
  lg: "text-[40px] leading-10 tracking-[-0.025em]",
  md: "text-[22px] leading-[22px] tracking-[-0.02em]",
};

export function PriceBlock({
  priceMonthly,
  size = "md",
  suffix = "per month",
  layout = "inline",
  className,
}: {
  priceMonthly: number | null | undefined;
  size?: PriceSize;
  suffix?: string;
  layout?: "inline" | "stacked";
  className?: string;
}) {
  const price = (
    <span className={cn("font-light text-foreground", SIZE[size])}>
      {formatPrice(priceMonthly)}
    </span>
  );
  if (layout === "stacked") {
    return (
      <div className={cn("flex flex-col items-end", className)}>
        {price}
        <span className="text-[10px] text-slate leading-3">{suffix}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex items-baseline gap-1.5", className)}>
      {price}
      <span className="text-[13px] text-slate">{suffix}</span>
    </div>
  );
}
