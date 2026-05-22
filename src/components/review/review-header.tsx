/**
 * Review screen top bar.
 *
 * Two things:
 *   - A "search pill" on the left summarising the active search the
 *     user's queue is currently drawing from (e.g. `North London · 2-bed`).
 *     v1 is non-interactive — PR 8 / v1.1 will turn it into a search
 *     switcher.
 *   - On the right, an `N LEFT TODAY` counter and the user avatar
 *     (initial circle in `--copper`).
 *
 * Mirrors the artboard's header strip exactly. The avatar logic is
 * cloned from `TopBar` — they couldn't share a component because the
 * Review header has the search pill instead of a page title.
 */
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { useHousehold } from "../../lib/household-context";

type Props = {
  /** Pre-composed pill text. Defaults to a generic fallback. */
  searchPill?: string;
  /** Number of cards still in today's queue (including current). */
  leftToday: number;
};

export function ReviewHeader({ searchPill, leftToday }: Props) {
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-background px-4 py-3">
      <button
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-card-foreground text-sm"
        type="button"
      >
        <span className="font-medium">{searchPill ?? "Your queue"}</span>
        <HugeiconsIcon
          className="text-muted-foreground"
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={2}
        />
      </button>
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="font-serif text-foreground text-xl">{leftToday}</p>
          <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            Left today
          </p>
        </div>
        <Avatar aria-label={me?.name ?? me?.email ?? "Profile"}>
          <AvatarFallback className="bg-primary font-medium text-primary-foreground text-sm">
            {initial}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
