import { cn } from "@/lib/utils";
/**
 * Defers mounting `children` until the wrapper is actually visible.
 *
 * The app renders both the desktop and mobile trees and hides one with
 * `lg:hidden` / `hidden lg:flex` (the SSR-safe device split — see
 * docs/device-parity-plan.md). `display:none` still mounts and runs every
 * effect, so a hidden copy of a heavy widget (the interactive map, an Embla
 * carousel) would needlessly initialise. A `display:none` element reports
 * `isIntersecting: false` to IntersectionObserver, so this wrapper keeps the
 * hidden copy's children unmounted until CSS reveals it at the `lg` flip.
 *
 * Renders a wrapper `<div>` so the observer always has a layout box to watch
 * (`display:contents`/fragments have no box and never intersect). Once shown,
 * it stays mounted — we don't tear heavy widgets back down on resize.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

export function MountWhenVisible({
  children,
  className,
  /** Rendered in the hidden copy's place until it becomes visible. */
  placeholder = null,
}: {
  children: ReactNode;
  className?: string;
  placeholder?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div className={cn(className)} ref={ref}>
      {visible ? children : placeholder}
    </div>
  );
}
