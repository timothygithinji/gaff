import { cn } from "@/lib/utils";
/**
 * Shared section primitives — the "card vs bare" treatment first written for
 * the Search form, promoted here so every feature uses one source.
 *
 * `SectionCard` is the device-agnostic primitive: a desktop bordered card
 * (`variant="card"`) or an edge-to-edge padded mobile column (`variant="bare"`),
 * matching Paper's mobile sections. The owning layout passes the variant
 * literally — the primitive never detects the device itself.
 */
import type { ReactNode } from "react";

export type SectionVariant = "card" | "bare";

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-semibold text-[17px] text-navy leading-[22px]">
      {children}
    </h2>
  );
}

export function SectionCard({
  title,
  titleRight,
  variant = "card",
  children,
}: {
  title: string;
  titleRight?: ReactNode;
  variant?: SectionVariant;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3.5",
        variant === "bare" ? "px-5" : "rounded-lg border border-line bg-paper p-6"
      )}
    >
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        {titleRight}
      </div>
      {children}
    </section>
  );
}

/**
 * Lighter grouping than {@link SectionCard} — a titled column that never draws
 * card chrome. `variant="bare"` adds the mobile edge inset (`px-5`).
 */
export function Section({
  title,
  subtitle,
  variant = "card",
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: SectionVariant;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-2.5", variant === "bare" && "px-5")}>
      <SectionTitle>{title}</SectionTitle>
      {subtitle ? (
        <p className="-mt-1.5 text-[12px] text-slate">{subtitle}</p>
      ) : null}
      {children}
    </section>
  );
}
