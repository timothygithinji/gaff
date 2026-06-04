/**
 * Round portal mark used wherever we list portals (listing-detail price
 * card, review "Same property" panel). Renders the real portal logo via
 * Google's favicon service, filling the badge (`object-cover`) so the
 * logo's own background becomes the avatar background — no white ring.
 * Falls back to a brand-tinted initial when the portal is unknown or the
 * logo fails to load.
 *
 * Accepts either a slug (`"rightmove"`) or a pretty name (`"Rightmove"`);
 * it normalises to the slug internally.
 */
import { useState } from "react";
import { cn } from "../lib/utils";

const PORTAL_DOMAIN: Record<string, string> = {
  rightmove: "rightmove.co.uk",
  zoopla: "zoopla.co.uk",
  openrent: "openrent.co.uk",
};

const PORTAL_FALLBACK_BG: Record<string, string> = {
  rightmove: "bg-slate",
  zoopla: "bg-slate-2",
  openrent: "bg-primary",
};

export function PortalLogo({ portal }: { portal: string }) {
  const slug = portal.toLowerCase();
  const domain = PORTAL_DOMAIN[slug];
  const [failed, setFailed] = useState(false);

  if (domain && !failed) {
    return (
      <span className="size-6 shrink-0 overflow-hidden rounded-full bg-mist">
        {/* biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component. */}
        <img
          alt={`${portal} logo`}
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full font-semibold text-[#eef1f4] text-[11px]",
        PORTAL_FALLBACK_BG[slug] ?? "bg-primary"
      )}
    >
      {portal.charAt(0).toUpperCase()}
    </span>
  );
}
