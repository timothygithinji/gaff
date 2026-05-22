/**
 * Featured match card — the big dark hero card that sits above the
 * "Other mutual picks" list on the Shortlist screen. Renders the
 * cheapest portal's photo behind a gradient overlay, the address +
 * price + portal info, the mutual badge, and the "Plan a viewing" CTA.
 *
 * The card itself is a button — tapping anywhere outside the CTA
 * navigates to `/listings/$clusterId` (handled by the parent route,
 * which wires `onOpen`).
 */
import { Message01Icon, Share05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import type { MutualMatch } from "../../server/functions/shortlist";
import { MutualBadge } from "./mutual-badge";

type Props = {
  match: MutualMatch;
  memberCount: number;
  ageLabel: string;
  onOpen: () => void;
  onPlanViewing: () => void;
};

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function portalLabel(portal: string): string {
  if (portal === "rightmove") {
    return "Rightmove";
  }
  if (portal === "zoopla") {
    return "Zoopla";
  }
  if (portal === "openrent") {
    return "OpenRent";
  }
  return portal;
}

function bedBathSummary(beds: number | null, baths: number | null): string {
  const parts: string[] = [];
  if (beds !== null) {
    parts.push(`${beds} bed`);
  }
  if (baths !== null) {
    parts.push(`${baths} bath`);
  }
  return parts.join(" · ");
}

function outcodeOf(postcode: string | null): string {
  if (!postcode) {
    return "";
  }
  const trimmed = postcode.trim().toUpperCase();
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

export function MatchCard({
  match,
  memberCount,
  ageLabel,
  onOpen,
  onPlanViewing,
}: Props) {
  const { headline, members } = match;
  const outcode = outcodeOf(headline.postcode);
  const subtitle = [
    outcode,
    bedBathSummary(headline.bedrooms, headline.bathrooms),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-4 mb-5 overflow-hidden rounded-[18px] bg-foreground">
      <button
        className="relative block h-50 w-full overflow-hidden text-left"
        onClick={onOpen}
        type="button"
      >
        {headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start, not Next.js — R2 URLs are cache-tagged.
          <img
            alt={headline.addressRaw}
            className="h-full w-full object-cover opacity-[0.86]"
            src={headline.photoUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <p className="text-muted-foreground text-sm">No photo yet</p>
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(28,26,23,0.85) 0%, rgba(28,26,23,0.15) 50%, rgba(0,0,0,0) 100%)",
          }}
        />
        <div className="absolute top-3.5 left-3.5">
          <MutualBadge
            ageLabel={ageLabel}
            memberCount={memberCount}
            members={members}
          />
        </div>
        <div className="absolute right-3.5 bottom-3.5 left-4 flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-serif text-[22px] text-primary-foreground leading-[110%] tracking-[-0.02em]">
              {headline.addressRaw}
            </span>
            <span className="text-[#E8D6C9] text-xs">{subtitle || "—"}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-serif text-[24px] text-primary-foreground leading-none tracking-[-0.02em]">
              {formatPrice(headline.priceMonthly)}
            </span>
            <span className="mt-0.5 text-[#E8D6C9] text-[10px]">
              /mo · {portalLabel(headline.portal)}
            </span>
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <Button
          className="flex-1 rounded-full font-semibold text-[13px]"
          onClick={onPlanViewing}
          type="button"
        >
          <HugeiconsIcon icon={Message01Icon} size={16} strokeWidth={2} />
          Plan a viewing
        </Button>
        <Button
          aria-label="Share"
          className="size-9.5 shrink-0 rounded-full border-bone/20 bg-transparent text-primary-foreground hover:bg-muted/10"
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.share) {
              navigator
                .share({
                  title: headline.addressRaw,
                  url: headline.url,
                })
                .catch(() => {
                  // Share was cancelled or denied; nothing we can do.
                });
            }
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={Share05Icon} size={16} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

/**
 * "Plan a viewing" fallback when the portal didn't capture an agent
 * email. Copies the listing URL to the clipboard and toasts a confirm.
 * Exposed so the parent route can compose this hook without re-implementing
 * the clipboard plumbing.
 */
export function usePlanViewing(): {
  toast: string | null;
  planViewing: (headline: { agentEmail: string | null; url: string }) => void;
} {
  const [toast, setToast] = useState<string | null>(null);

  function planViewing(headline: { agentEmail: string | null; url: string }) {
    if (headline.agentEmail) {
      window.location.href = `mailto:${headline.agentEmail}?subject=${encodeURIComponent(
        "Viewing request"
      )}`;
      return;
    }
    // Fallback — copy the URL so the user can paste it into their own
    // viewing-request channel.
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(headline.url)
        .then(() => {
          setToast("Listing URL copied — paste into your email / WhatsApp");
          setTimeout(() => setToast(null), 3000);
        })
        .catch(() => {
          // Clipboard write denied; show the URL inline so the user
          // can at least long-press to copy it.
          setToast(`Open listing: ${headline.url}`);
          setTimeout(() => setToast(null), 4000);
        });
    } else {
      setToast(`Open listing: ${headline.url}`);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return { toast, planViewing };
}
