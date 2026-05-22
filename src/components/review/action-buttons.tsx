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
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";

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
      <Button
        aria-label="Undo last swipe"
        className="size-11 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onUndo}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon
          icon={ArrowReloadHorizontalIcon}
          size={18}
          strokeWidth={1.8}
        />
      </Button>

      <Button
        aria-label="Skip"
        className="size-13 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onSkip}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={22} strokeWidth={1.8} />
      </Button>

      <Button
        aria-label="More info"
        asChild
        className="size-11 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        size="icon"
        variant="outline"
      >
        <Link params={{ clusterId }} to="/listings/$clusterId">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={18}
            strokeWidth={1.8}
          />
        </Link>
      </Button>

      <Button
        aria-label="Keep"
        className="size-16 rounded-full shadow-lg"
        disabled={disabled}
        onClick={onKeep}
        size="icon"
        type="button"
      >
        <HugeiconsIcon icon={FavouriteIcon} size={28} strokeWidth={2} />
      </Button>

      <Button
        aria-label="Shortlist"
        className="size-13 rounded-full border-border bg-card text-muted-foreground hover:bg-muted"
        disabled={disabled}
        onClick={onShortlist}
        size="icon"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon icon={StarIcon} size={20} strokeWidth={1.8} />
      </Button>
    </div>
  );
}
