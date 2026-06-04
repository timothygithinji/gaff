/**
 * Review screen top bar (mobile) — pixel-matched to Paper "Review —
 * Mobile" (artboard 23F).
 *
 * Left cluster: a 30px round navy avatar with the household initial,
 * beside a two-line block — small-caps "SEARCH · ACTIVE" over the
 * active search pill ("North London · 2-bed").
 * Right cluster: the big light `leftToday` count over small-caps
 * "TO REVIEW".
 *
 * Presentation only — consumes the same `searchPill` + `leftToday`
 * props the route already passed.
 */
import { Link } from "@tanstack/react-router";
import { useHousehold } from "../../lib/household-context";

type Props = {
  /** Pre-composed search pill text (e.g. "North London · 2-bed"). */
  searchPill?: string;
  /** Number of cards still in the queue (the "TO REVIEW" count). */
  leftToday: number;
};

export function ReviewHeader({ searchPill, leftToday }: Props) {
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);
  const initial = (me?.name || me?.email || "?").charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-background px-5 py-3.5">
      <div className="flex items-center gap-3">
        <Link
          aria-label={`${me?.name ?? me?.email ?? "Profile"} — household settings`}
          className="flex size-[30px] items-center justify-center rounded-full bg-primary font-semibold text-[13px] text-white"
          to="/settings/household"
        >
          {initial}
        </Link>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[10px] text-slate uppercase tracking-[0.1em]">
            Search · Active
          </span>
          <span className="font-semibold text-[13px] text-navy">
            {searchPill ?? "Your queue"}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-light text-[22px] text-navy leading-none">
          {leftToday}
        </span>
        <span className="font-semibold text-[9px] text-slate uppercase tracking-[0.14em]">
          To review
        </span>
      </div>
    </header>
  );
}
