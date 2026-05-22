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
    <header className="sticky top-0 z-20 flex items-center justify-between bg-ground px-4 py-3">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-brass/20 bg-paper px-4 py-2 text-ink text-sm">
        <span className="font-medium">{searchPill ?? "Your queue"}</span>
        <span aria-hidden className="text-brass">
          ▾
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <p className="font-serif text-ink text-xl">{leftToday}</p>
          <p className="font-medium text-[10px] text-brass uppercase tracking-wider">
            Left today
          </p>
        </div>
        <div
          aria-label={me?.name ?? me?.email ?? "Profile"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-copper font-medium text-bone text-sm"
        >
          {initial}
        </div>
      </div>
    </header>
  );
}
