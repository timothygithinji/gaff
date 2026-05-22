/**
 * MetricCard — bone card with a copper small-caps eyebrow, a Fraunces
 * serif stat headline, and an optional sparkline + subtle sub line.
 * Matches the 1440px Admin artboard's metric-card row.
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
    <div className="flex flex-col justify-between rounded-2xl bg-bone p-5">
      <p className="font-semibold text-[10px] text-copper uppercase tracking-[0.12em]">
        {eyebrow}
      </p>
      <p className="mt-2 font-serif text-3xl text-ink leading-tight">{stat}</p>
      {sub && <div className="mt-2 text-brass text-xs">{sub}</div>}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3">
          <Sparkline data={sparkline} stroke={sparklineStroke} />
        </div>
      )}
    </div>
  );
}
