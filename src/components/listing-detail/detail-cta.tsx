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
    <div className="fixed right-0 bottom-0 left-0 z-30 mx-auto flex max-w-md items-center gap-2.5 border-[#E5DDD0] border-t bg-[#F4EFE6EB] px-5 pt-3.5 pb-7 backdrop-blur">
      <button
        aria-label="Skip"
        className="flex h-13 w-13 shrink-0 items-center justify-center rounded-[999px] border border-[#E5DDD0] bg-[#FDFAF4] disabled:opacity-50"
        disabled={disabled}
        onClick={onSkip}
        type="button"
      >
        <svg
          fill="none"
          height="20"
          role="img"
          stroke="#8C3A35"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
          width="20"
        >
          <title>Skip</title>
          <line x1="18" x2="6" y1="6" y2="18" />
          <line x1="6" x2="18" y1="6" y2="18" />
        </svg>
      </button>

      <button
        aria-pressed={iKept}
        className="flex h-13 grow basis-0 items-center justify-center gap-2 rounded-[999px] bg-copper disabled:opacity-60"
        disabled={disabled}
        onClick={onKeep}
        type="button"
      >
        <svg
          fill="#FDFAF4"
          height="18"
          role="img"
          viewBox="0 0 24 24"
          width="18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Keep</title>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <span className="font-semibold text-[15px] text-bone tracking-[-0.01em]">
          {label}
        </span>
      </button>

      <button
        aria-label="Shortlist"
        aria-pressed={mySwipe === "shortlist"}
        className="flex h-13 w-13 shrink-0 items-center justify-center rounded-[999px] border border-[#E5DDD0] bg-[#FDFAF4] disabled:opacity-50"
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        <svg
          fill={mySwipe === "shortlist" ? "#7A6A4A" : "none"}
          height="20"
          role="img"
          stroke="#7A6A4A"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="20"
        >
          <title>Shortlist</title>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
    </div>
  );
}
