/**
 * Sticky bottom CTA bar for the listing-detail screen.
 *
 * Composes three controls:
 *   ✕   ghost skip button (left)
 *   ❤   primary keep button (centre, copper) — copy varies by state
 *   ★   ghost shortlist button (right)
 *
 * The CTA copy logic encodes the spec's decision table:
 *
 *   1 member  → "Keep" (unswiped) or "Saved" (kept)
 *   2 members →
 *     - neither has acted        → "Keep"
 *     - both kept                → "Both kept"
 *     - I kept, partner hasn't   → "Keep · waiting on <FirstName>"
 *     - partner kept, I haven't  → "Keep · they're waiting on you"
 *   3+        →
 *     - none kept yet            → "Keep"
 *     - I kept, others haven't   → "Keep · waiting on <First> + N others"
 *     - I haven't, but >0 others have → "Keep · they're waiting on you"
 *     - all kept                 → "All kept"
 *
 * "Kept" here means the user's swipe outcome is `keep` or `shortlist`
 * — both flag the listing as something the household wants to pursue.
 */
import {
  Cancel01Icon,
  FavouriteIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "../../components/ui/button";
import type { ListingDetailPartnerSwipe } from "../../server/functions/listing-detail";

type Props = {
  memberCount: number;
  mySwipe: "keep" | "skip" | "shortlist" | undefined;
  partnerSwipes: ListingDetailPartnerSwipe[];
  /** Disabled while a swipe mutation is in flight. */
  disabled?: boolean;
  onKeep: () => void;
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
    return iKept ? "Saved" : "Keep";
  }

  const keptPartners = partnerSwipes.filter((p) => isKept(p.outcome));
  const outstandingPartners = partnerSwipes.filter((p) => !isKept(p.outcome));

  if (memberCount === 2) {
    const partner = partnerSwipes[0];
    if (!partner) {
      return iKept ? "Saved" : "Keep";
    }
    const partnerKept = isKept(partner.outcome);
    if (iKept && partnerKept) {
      return "Both kept";
    }
    if (iKept && !partnerKept) {
      return `Keep · waiting on ${firstNameOf(partner.name)}`;
    }
    if (!iKept && partnerKept) {
      return "Keep · they're waiting on you";
    }
    return "Keep";
  }

  // 3+ households.
  if (iKept && outstandingPartners.length === 0) {
    return "All kept";
  }
  if (iKept && outstandingPartners.length > 0) {
    const first = outstandingPartners[0];
    if (!first) {
      return "Saved";
    }
    const remaining = outstandingPartners.length - 1;
    if (remaining === 0) {
      return `Keep · waiting on ${firstNameOf(first.name)}`;
    }
    return `Keep · waiting on ${firstNameOf(first.name)} + ${remaining} other${remaining === 1 ? "" : "s"}`;
  }
  if (!iKept && keptPartners.length > 0) {
    return "Keep · they're waiting on you";
  }
  return "Keep";
}

export function DetailCta({
  memberCount,
  mySwipe,
  partnerSwipes,
  disabled,
  onKeep,
  onSkip,
  onShortlist,
}: Props) {
  const label = detailCtaLabel({ memberCount, mySwipe, partnerSwipes });
  const iKept = isKept(mySwipe);

  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 mx-auto flex max-w-md items-center gap-2.5 border-border border-t bg-background/95 px-5 pt-3.5 pb-7 backdrop-blur">
      <Button
        aria-label="Skip"
        className="size-13 shrink-0 rounded-full border-border bg-card text-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onSkip}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={2.2} />
      </Button>

      <Button
        aria-pressed={iKept}
        className="h-13 grow basis-0 rounded-full font-semibold text-[15px] tracking-[-0.01em]"
        disabled={disabled}
        onClick={onKeep}
        type="button"
      >
        <HugeiconsIcon icon={FavouriteIcon} size={18} strokeWidth={2.2} />
        {label}
      </Button>

      <Button
        aria-label="Shortlist"
        aria-pressed={mySwipe === "shortlist"}
        className={`size-13 shrink-0 rounded-full border-border bg-card hover:bg-muted ${
          mySwipe === "shortlist" ? "text-foreground" : "text-muted-foreground"
        }`}
        disabled={disabled}
        onClick={onShortlist}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={StarIcon} size={20} strokeWidth={2} />
      </Button>
    </div>
  );
}
