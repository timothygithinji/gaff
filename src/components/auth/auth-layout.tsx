import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Shared chrome for the three auth screens (login / signup / invite),
 * matching the Paper "Gaff" auth artboards.
 *
 * Breakpoints:
 * - mobile (390) / tablet (768): single column. The gaff wordmark sits
 *   top-left; the form/content column is centred with a max width. Mobile
 *   is top-weighted, tablet vertically centres the column.
 * - laptop (1280) / desktop (1440): split panel. Left = white surface with
 *   the centred content column and the wordmark pinned top-left; right =
 *   navy marketing panel (`<MarketingPanel/>`).
 *
 * Colours come from the maritime tokens in globals.css; the steel-blue
 * label (#1f3a5f) and copper accent (#d77a4a) used by the auth screens have
 * no semantic token, so they're applied as arbitrary values to match Paper.
 */

/** gaff wordmark with the house mark, as drawn in every auth artboard. */
function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        aria-hidden="true"
        className="size-[22px] shrink-0"
        fill="none"
        viewBox="0 0 22 22"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 11L11 3L19 11V18C19 18.55 18.55 19 18 19H4C3.45 19 3 18.55 3 18V11Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M9 19V13H13V19"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
      <span className="font-bold text-[15px] text-foreground leading-[18px] tracking-[-0.01em]">
        Gaff
      </span>
    </div>
  );
}

const FEATURES = [
  "Cross-portal duplicate detection",
  "Floor plans read by Claude",
  "Hidden until you both agree",
] as const;

/**
 * Navy marketing column shown on the right at lg+ on all auth screens.
 *
 * Every text/icon colour here is a PINNED literal (hex or white/opacity) — the
 * panel background is the fixed navy `#0e2235`, so we must never use a theme
 * token (text-foreground/text-navy/text-mist/text-primary). Those tokens flip
 * with the colour scheme and resolve to navy in light mode, which renders the
 * copy invisible against the navy panel.
 */
function MarketingPanel() {
  return (
    <div className="hidden flex-col justify-between bg-[#0e2235] p-12 lg:flex">
      <div className="flex flex-col gap-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1f3a5f] font-semibold text-[#eef1f4] text-[11px] leading-[14px]">
            T
          </span>
          <span className="-ml-2.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#d77a4a] font-semibold text-[11px] text-white leading-[14px]">
            P
          </span>
          <span className="pl-1 text-[#5a7596] text-[11px] uppercase leading-[14px] tracking-[0.14em]">
            Built for two
          </span>
        </div>
        <h2 className="max-w-[420px] font-light text-[#eef1f4] text-[30px] leading-9 tracking-[-0.02em]">
          Find a flat together, without the wars.
        </h2>
        <p className="max-w-[380px] text-[#c9d3dc] text-sm leading-[22px]">
          Blind veto loop, AI floor plan reads, every portal in one queue. You
          both swipe — only mutual yeses surface.
        </p>
      </div>
      <ul className="flex flex-col gap-3.5">
        {FEATURES.map((feature) => (
          <li className="flex items-center gap-2.5" key={feature}>
            <svg
              aria-hidden="true"
              className="size-3.5 shrink-0 text-[#d77a4a]"
              fill="none"
              viewBox="0 0 14 14"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 7L6 10L11 4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
            </svg>
            <span className="text-[#c9d3dc] text-[13px] leading-4">
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-ground text-foreground lg:grid-cols-2">
      {/* Left / single-column panel */}
      <div className="relative flex flex-col px-6 pt-5 pb-8 sm:px-10 lg:items-center lg:justify-center lg:px-12 lg:py-12">
        {/* Wordmark: inline-flow on mobile, pinned top-left from tablet up. */}
        <Wordmark className="pt-[30px] sm:hidden" />
        <Wordmark className="absolute top-10 left-10 hidden sm:flex lg:top-8 lg:left-12" />

        <div className="flex w-full flex-1 flex-col justify-start sm:justify-center lg:flex-none">
          <div className="mx-auto w-full max-w-[400px] lg:max-w-[380px]">
            {children}
          </div>
        </div>
      </div>

      <MarketingPanel />
    </main>
  );
}

/** Section eyebrow: small-caps steel-blue label above each heading. */
export function AuthEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className='text-[#1f3a5f] text-[11px] uppercase leading-[14px] tracking-[0.14em]'>
      {children}
    </p>
  );
}

/** The big "Sign in to your household" style heading. */
export function AuthHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "font-semibold text-[32px] text-foreground leading-9 tracking-[-0.025em]",
        className
      )}
    >
      {children}
    </h1>
  );
}
