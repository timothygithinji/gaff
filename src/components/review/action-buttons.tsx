/**
 * Mobile action dock beneath the review card — pixel-matched to Paper
 * "Review · Mobile" (artboard 23F, "Action dock").
 *
 *   Undo   (50px white outline circle, ←)            — pop last swipe
 *   Skip   (50px white outline circle, navy ✕)       — outcome="skip"
 *   Keep   (flex-grow 56px navy pill, ♡ + label)     — outcome="shortlist"
 *
 * The navy pill is a FIXED-colour surface, so its icon + text pin literal
 * `#eef1f4` (theme tokens flip in dark mode → invisible). When a partner is
 * in the household the pill reads "Keep · waiting on <initial>" — the
 * blind-veto rule lets us say a partner is pending, never their verdict.
 *
 * Presentation only — bubbles the same callbacks the route wired.
 */
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useHouseholdOptional } from "../../lib/household-context";

export type ActionButtonsPending = "shortlist" | "skip" | "undo" | null;

type Props = {
  clusterId: string;
  disabled?: boolean;
  pendingAction?: ActionButtonsPending;
  onUndo: () => void;
  onSkip: () => void;
  onShortlist: () => void;
};

export function ActionButtons({
  disabled,
  pendingAction = null,
  onUndo,
  onSkip,
  onShortlist,
}: Props) {
  const household = useHouseholdOptional();
  const partner = household?.otherMembers[0];
  const partnerInitial = partner
    ? (partner.name || partner.email || "?").charAt(0).toUpperCase()
    : null;
  const keepLabel = partnerInitial ? `Keep · waiting on ${partnerInitial}` : "Keep";

  return (
    <div className="flex items-center justify-between gap-2.5 px-5 pt-[22px] pb-4">
      <button
        aria-busy={pendingAction === "undo" || undefined}
        aria-label="Undo last swipe"
        className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-line bg-paper text-slate transition-colors hover:bg-mist disabled:opacity-50"
        disabled={disabled}
        onClick={onUndo}
        type="button"
      >
        {pendingAction === "undo" ? (
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={18}
            strokeWidth={1.8}
          />
        ) : (
          <UndoGlyph />
        )}
      </button>

      <button
        aria-busy={pendingAction === "skip" || undefined}
        aria-label="Skip"
        className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-line bg-paper text-navy transition-colors hover:bg-mist disabled:opacity-50"
        disabled={disabled}
        onClick={onSkip}
        type="button"
      >
        {pendingAction === "skip" ? (
          <HugeiconsIcon
            className="animate-spin text-slate"
            icon={Loading03Icon}
            size={18}
            strokeWidth={1.8}
          />
        ) : (
          <CloseGlyph />
        )}
      </button>

      <button
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-label="Shortlist"
        className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[32px] bg-navy font-medium text-[13px] text-white tracking-[0.04em] transition-opacity hover:opacity-95 disabled:opacity-50"
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        {pendingAction === "shortlist" ? (
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
          />
        ) : (
          <HeartGlyph />
        )}
        <span>{keepLabel}</span>
      </button>
    </div>
  );
}

/** ← undo arrow with tail (matches the Paper SVG). */
function UndoGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 9L7 5M3 9L7 13M3 9H15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 5L13 13M13 5L5 13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Outline heart (stroke, not filled) for the Keep pill. */
function HeartGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 14C8 14 1.5 10 1.5 5.5C1.5 3.5 3 2 5 2C6.5 2 7.5 3 8 4C8.5 3 9.5 2 11 2C13 2 14.5 3.5 14.5 5.5C14.5 10 8 14 8 14Z"
        stroke="#EEF1F4"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
