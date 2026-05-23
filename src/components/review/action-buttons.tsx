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
 * can't double-tap-fire two swipes in flight at once.
 */
import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  FavouriteIcon,
  InformationCircleIcon,
  Loading03Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";

/**
 * Which mutation is mid-flight. Swaps the matching button's icon for a
 * spinner so the user sees instant feedback even when the network
 * hasn't returned yet. `null` means nothing pending.
 */
export type ActionButtonsPending =
  | "keep"
  | "skip"
  | "shortlist"
  | "undo"
  | null;

type Props = {
  clusterId: string;
  disabled?: boolean;
  pendingAction?: ActionButtonsPending;
  onUndo: () => void;
  onSkip: () => void;
  onKeep: () => void;
  onShortlist: () => void;
};

export function ActionButtons({
  clusterId,
  disabled,
  pendingAction = null,
  onUndo,
  onSkip,
  onKeep,
  onShortlist,
}: Props) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <Button
        aria-busy={pendingAction === "undo" || undefined}
        aria-label="Undo last swipe"
        className="size-11 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onUndo}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          className={pendingAction === "undo" ? "animate-spin" : undefined}
          icon={
            pendingAction === "undo" ? Loading03Icon : ArrowReloadHorizontalIcon
          }
          size={18}
          strokeWidth={1.8}
        />
      </Button>

      <Button
        aria-busy={pendingAction === "skip" || undefined}
        aria-label="Skip"
        className="size-13 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onSkip}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          className={pendingAction === "skip" ? "animate-spin" : undefined}
          icon={pendingAction === "skip" ? Loading03Icon : Cancel01Icon}
          size={22}
          strokeWidth={1.8}
        />
      </Button>

      <Button
        aria-label="More info"
        className="size-11 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        render={
          <Link
            params={{ clusterId }}
            search={{ from: "review" }}
            to="/listings/$clusterId"
          />
        }
        size="icon"
        variant="outline"
      >
        <HugeiconsIcon
          icon={InformationCircleIcon}
          size={18}
          strokeWidth={1.8}
        />
      </Button>

      <Button
        aria-busy={pendingAction === "keep" || undefined}
        aria-label="Keep"
        className="size-16 rounded-full shadow-lg"
        disabled={disabled}
        onClick={onKeep}
        size="icon"
        type="button"
      >
        <HugeiconsIcon
          className={pendingAction === "keep" ? "animate-spin" : undefined}
          icon={pendingAction === "keep" ? Loading03Icon : FavouriteIcon}
          size={28}
          strokeWidth={2}
        />
      </Button>

      <Button
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-label="Shortlist"
        className="size-13 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onShortlist}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          className={pendingAction === "shortlist" ? "animate-spin" : undefined}
          icon={pendingAction === "shortlist" ? Loading03Icon : StarIcon}
          size={20}
          strokeWidth={1.8}
        />
      </Button>
    </div>
  );
}
