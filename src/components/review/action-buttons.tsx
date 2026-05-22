/**
 * Five-button action row beneath the review card.
 *
 *   Undo  (ghost circle)         — pop the last swipe off the stack
 *   Skip  (X circle)             — outcome="skip"
 *   Info  (i circle)             — navigates to /listings/$clusterId
 *   Keep  (big copper heart)     — outcome="keep" (primary)
 *   Star  (ghost circle)         — outcome="shortlist"
 *
 * All five take `disabled` while a mutation is pending so the user
 * can't double-tap-fire two swipes in flight at once. The "info" button
 * is a plain anchor because the `/listings/$clusterId` route lands in
 * PR 9 — going through the typed router would tie this PR to PR 9.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  clusterId: string;
  disabled?: boolean;
  onUndo: () => void;
  onSkip: () => void;
  onKeep: () => void;
  onShortlist: () => void;
};

export function ActionButtons({
  clusterId,
  disabled,
  onUndo,
  onSkip,
  onKeep,
  onShortlist,
}: Props) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <CircleButton
        aria-label="Undo last swipe"
        disabled={disabled}
        onClick={onUndo}
        size="sm"
      >
        <span aria-hidden>↶</span>
      </CircleButton>
      <CircleButton
        aria-label="Skip"
        disabled={disabled}
        onClick={onSkip}
        size="md"
      >
        <span aria-hidden>✕</span>
      </CircleButton>
      <a
        className={`flex h-12 w-12 items-center justify-center rounded-full border border-brass/30 bg-paper text-brass ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
        href={`/listings/${clusterId}`}
      >
        <span className="sr-only">More info</span>
        <span aria-hidden>i</span>
      </a>
      <button
        aria-label="Keep"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-copper text-bone shadow-lg disabled:opacity-50"
        disabled={disabled}
        onClick={onKeep}
        type="button"
      >
        <span aria-hidden className="text-2xl">
          ♥
        </span>
      </button>
      <CircleButton
        aria-label="Shortlist"
        disabled={disabled}
        onClick={onShortlist}
        size="md"
      >
        <span aria-hidden>★</span>
      </CircleButton>
    </div>
  );
}

function CircleButton({
  children,
  size,
  disabled,
  onClick,
  ...rest
}: {
  children: ReactNode;
  size: "sm" | "md";
  disabled?: boolean;
  onClick: () => void;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const dimensions = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  return (
    <button
      className={`flex ${dimensions} items-center justify-center rounded-full border border-brass/30 bg-paper text-brass disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      type="button"
      {...rest}
    >
      {children}
    </button>
  );
}
