import * as React from "react";

// Tracks the same breakpoint as the desktop/mobile shell boundary in the
// route shells (`lg:hidden` for mobile content, `hidden lg:contents` for the
// `AdminSidebar` desktop chrome). Below this width we render the
// `max-w-md` mobile layout — including on iPad portrait (768–1023 px) —
// because the desktop three-column layouts assume ≥1024 px and break
// otherwise. Bump in lockstep with the Tailwind `lg:` switches.
const MOBILE_BREAKPOINT = 1024;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
