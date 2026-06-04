/**
 * Shared small-caps section eyebrow for the listing-detail screen.
 *
 * Paper (mobile 2T3-0 section headers): slate `#1F3A5F` text, 11px,
 * weight 400, `tracking-[0.14em]`, uppercase. Used verbatim by every
 * mobile section ("FLOOR PLAN · CLAUDE READ", "PUBLIC RECORDS", …).
 */
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-normal text-[11px] text-slate uppercase leading-[14px] tracking-[0.14em]",
        className
      )}
    >
      {children}
    </span>
  );
}
