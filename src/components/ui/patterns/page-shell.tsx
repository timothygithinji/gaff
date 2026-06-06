import { cn } from "@/lib/utils";
/**
 * The per-device page container, promoted from the wrapper that was
 * copy-pasted across 8+ routes:
 *
 *   <div className="mx-auto min-h-screen max-w-md bg-background sm:max-w-2xl lg:hidden">
 *
 * The two variants are a symmetric, SSR-safe pair around the `lg` (1024px)
 * boundary that {@link useIsMobile} mirrors: `mobile` shows below `lg`,
 * `desktop` at/above it. Pure CSS picks one with no JS, so there's no
 * hydration flash. Per-route extras (bottom-nav padding `pb-*`, an inner
 * `flex flex-col`) ride the `className` passthrough — the bottom padding
 * varies by route because each clears a different fixed footer.
 */
import type { ReactNode } from "react";

export type PageShellVariant = "mobile" | "desktop";

const SHELL: Record<PageShellVariant, string> = {
  mobile: "mx-auto min-h-screen max-w-md bg-background sm:max-w-2xl lg:hidden",
  desktop: "hidden min-h-screen bg-background lg:block",
};

export function PageShell({
  variant,
  className,
  children,
}: {
  variant: PageShellVariant;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(SHELL[variant], className)}>{children}</div>;
}
