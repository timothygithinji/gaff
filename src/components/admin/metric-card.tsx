/**
 * MetricCard — muted card with a primary small-caps eyebrow, a Fraunces
 * serif stat headline, and an optional sparkline + subtle sub line.
 */
import type { ReactNode } from "react";
import { Sparkline } from "./sparkline";

type MetricCardProps = {
  eyebrow: string;
  stat: string;
  sub?: ReactNode;
  sparkline?: number[];
  sparklineStroke?: string;
};

export function MetricCard({
  eyebrow,
  stat,
  sub,
  sparkline,
  sparklineStroke,
}: MetricCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-muted p-5">
      <p className="font-semibold text-[10px] text-primary uppercase tracking-[0.12em]">
        {eyebrow}
      </p>
      <p className="mt-2 font-serif text-3xl text-foreground leading-tight">
        {stat}
      </p>
      {sub && <div className="mt-2 text-muted-foreground text-xs">{sub}</div>}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3">
          <Sparkline data={sparkline} stroke={sparklineStroke} />
        </div>
      )}
    </div>
  );
}
