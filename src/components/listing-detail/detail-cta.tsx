/**
 * Sticky bottom CTA bar for the listing-detail screen.
 *
 * Composes two controls:
 *   ✕   ghost skip button (left)
 *   ❤   primary shortlist button (right) — copy varies by state
 *
 * The CTA copy logic encodes the spec's decision table:
 *
 *   1 member  → "Shortlist" (unswiped) or "Shortlisted" (kept)
 *   2 members →
 *     - neither has acted        → "Shortlist"
 *     - both kept                → "Both shortlisted"
 *     - I kept, partner hasn't   → "Waiting on <FirstName>"
 *     - partner kept, I haven't  → "They're waiting on you"
 *   3+        →
 *     - none kept yet            → "Shortlist"
 *     - I kept, others haven't   → "Waiting on <First> + N others"
 *     - I haven't, but >0 others have → "They're waiting on you"
 *     - all kept                 → "All shortlisted"
 *
 * Legacy `outcome="keep"` rows (written before B1 collapsed the two
 * positive outcomes) still count as "kept" — the mutual-match math
 * doesn't break for households who reviewed in v1.
 */
import {
  Cancel01Icon,
  FavouriteIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "../../components/ui/button";
import type { ListingDetailPartnerSwipe } from "../../server/functions/listing-detail";

export type DetailCtaPendingAction = "shortlist" | "skip" | null;

type Props = {
  memberCount: number;
  mySwipe: "keep" | "skip" | "shortlist" | undefined;
  partnerSwipes: ListingDetailPartnerSwipe[];
  /** Disabled while a swipe mutation is in flight. */
  disabled?: boolean;
  /** Which swipe is currently mid-flight, if any. */
  pendingAction?: DetailCtaPendingAction;
  onSkip: () => void;
  onShortlist: () => void;
};

const WHITESPACE_RE = /\s+/;

function firstNameOf(name: string): string {
  const head = (name || "").trim().split(WHITESPACE_RE)[0];
  return head || "them";
}

/** A "kept" outcome is keep OR shortlist — both count as agreement. */
function isKept(o: "keep" | "skip" | "shortlist" | null | undefined): boolean {
  return o === "keep" || o === "shortlist";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: spec-mandated 1/2/3+ household decision table — flattening into helpers would lose the visible mapping to the requirements.
export function detailCtaLabel(args: {
  memberCount: number;
  mySwipe: "keep" | "skip" | "shortlist" | undefined;
  partnerSwipes: ListingDetailPartnerSwipe[];
}): string {
  const { memberCount, mySwipe, partnerSwipes } = args;
  const iKept = isKept(mySwipe);

  if (memberCount <= 1) {
    return iKept ? "Shortlisted" : "Shortlist";
  }

  const keptPartners = partnerSwipes.filter((p) => isKept(p.outcome));
  const outstandingPartners = partnerSwipes.filter((p) => !isKept(p.outcome));

  if (memberCount === 2) {
    const partner = partnerSwipes[0];
    if (!partner) {
      return iKept ? "Shortlisted" : "Shortlist";
    }
    const partnerKept = isKept(partner.outcome);
    if (iKept && partnerKept) {
      return "Both shortlisted";
    }
    if (iKept && !partnerKept) {
      return `Waiting on ${firstNameOf(partner.name)}`;
    }
    if (!iKept && partnerKept) {
      return "They're waiting on you";
    }
    return "Shortlist";
  }

  // 3+ households.
  if (iKept && outstandingPartners.length === 0) {
    return "All shortlisted";
  }
  if (iKept && outstandingPartners.length > 0) {
    const first = outstandingPartners[0];
    if (!first) {
      return "Shortlisted";
    }
    const remaining = outstandingPartners.length - 1;
    if (remaining === 0) {
      return `Waiting on ${firstNameOf(first.name)}`;
    }
    return `Waiting on ${firstNameOf(first.name)} + ${remaining} other${remaining === 1 ? "" : "s"}`;
  }
  if (!iKept && keptPartners.length > 0) {
    return "They're waiting on you";
  }
  return "Shortlist";
}

export function DetailCta({
  memberCount,
  mySwipe,
  partnerSwipes,
  disabled,
  pendingAction = null,
  onSkip,
  onShortlist,
}: Props) {
  const label = detailCtaLabel({ memberCount, mySwipe, partnerSwipes });
  const iKept = isKept(mySwipe);

  return (
    <div
      // `pb` uses `max(...)` so devices without a home-indicator (Android,
      // older iPhones, desktop browsers) keep the original 28-px gap,
      // while notched iPhones receive `safe-area-inset-bottom + 8 px` so
      // the CTA never sits under the home indicator.
      className="fixed right-0 bottom-0 left-0 z-30 mx-auto flex max-w-md items-center gap-2.5 border-border border-t bg-background/95 px-5 pt-3.5 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] backdrop-blur"
    >
      <Button
        aria-busy={pendingAction === "skip" || undefined}
        aria-label="Skip"
        className="size-13 shrink-0 rounded-full border-border bg-card text-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onSkip}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          className={pendingAction === "skip" ? "animate-spin" : undefined}
          icon={pendingAction === "skip" ? Loading03Icon : Cancel01Icon}
          size={20}
          strokeWidth={2.2}
        />
      </Button>

      <Button
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-pressed={iKept}
        className="h-13 grow basis-0 rounded-full font-semibold text-[15px] tracking-[-0.01em]"
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        <HugeiconsIcon
          className={pendingAction === "shortlist" ? "animate-spin" : undefined}
          icon={pendingAction === "shortlist" ? Loading03Icon : FavouriteIcon}
          size={18}
          strokeWidth={2.2}
        />
        {label}
      </Button>
    </div>
  );
}
