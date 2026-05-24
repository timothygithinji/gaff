/**
 * Four-button action row beneath the review card.
 *
 *   Undo       (ghost circle)         — pop the last swipe off the stack
 *   Skip       (X circle)             — outcome="skip"
 *   Info       (i circle)             — navigates to /listings/$clusterId
 *   Shortlist  (big copper heart)     — outcome="shortlist" (primary)
 *
 * The old separate "Keep" + "Shortlist" buttons collapsed to a single
 * positive outcome. The household-mutual-match rule already treats
 * keep + shortlist identically (see DetailCta's `isKept`), so two
 * buttons meant the same thing — the third button only added cognitive
 * load. Existing `outcome="keep"` rows in the DB are untouched and
 * still count as "kept" for mutual-match math.
 */
import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  FavouriteIcon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";

/**
 * Which mutation is mid-flight. Swaps the matching button's icon for a
 * spinner so the user sees instant feedback even when the network
 * hasn't returned yet. `null` means nothing pending.
 */
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
  clusterId,
  disabled,
  pendingAction = null,
  onUndo,
  onSkip,
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
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-label="Shortlist"
        className="size-16 rounded-full shadow-lg"
        disabled={disabled}
        onClick={onShortlist}
        size="icon"
        type="button"
      >
        <HugeiconsIcon
          className={pendingAction === "shortlist" ? "animate-spin" : undefined}
          icon={pendingAction === "shortlist" ? Loading03Icon : FavouriteIcon}
          size={28}
          strokeWidth={2}
        />
      </Button>
    </div>
  );
}
