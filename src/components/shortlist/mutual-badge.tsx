import { cn } from "../../lib/utils";
/**
 * Mutual-badge — pill that headlines a mutual-match card with an avatar
 * stack + "BOTH KEPT" / "ALL N KEPT" copy + an age string.
 *
 *   - 1 member  → renders null (callers branch on memberCount).
 *   - 2 members → "BOTH KEPT · <age>"
 *   - N members → "ALL N KEPT · <age>".
 *
 * Avatars use the maritime alternation (navy / copper) on a navy badge,
 * mirroring Paper's overlapping stack. Fixed-navy fills are pinned to
 * literal hex so they don't flip in the dark scene.
 */
import type { ShortlistMember } from "../../server/functions/shortlist";

type Props = {
  members: ShortlistMember[];
  memberCount: number;
  ageLabel: string;
};

export function MutualBadge({ members, memberCount, ageLabel }: Props) {
  if (memberCount <= 1) {
    return null;
  }
  const label = memberCount === 2 ? "Both kept" : `All ${memberCount} kept`;
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#0e2235d9] px-2.5 py-[5px] backdrop-blur-sm">
      <span className="flex items-center">
        {members.slice(0, 4).map((m, idx) => (
          <Avatar
            border="navy"
            idx={idx}
            initial={m.emailInitial}
            key={m.userId}
          />
        ))}
      </span>
      <span className='font-semibold text-[#eef1f4] text-[10px] uppercase leading-3 tracking-widest'>
        {label} · {ageLabel}
      </span>
    </span>
  );
}

/** Tiny avatar stack for compact list rows — same alternation, white
 * borders so the chips read against a paper-coloured card. */
export function CompactAvatarStack({
  members,
}: {
  members: ShortlistMember[];
}) {
  return (
    <span className="flex items-center">
      {members.slice(0, 4).map((m, idx) => (
        <Avatar border="card" idx={idx} initial={m.emailInitial} key={m.userId} />
      ))}
    </span>
  );
}

function Avatar({
  initial,
  idx,
  border,
}: {
  initial: string;
  idx: number;
  border: "navy" | "card";
}) {
  return (
    <span
      className={cn(
        "-ml-1.5 flex size-3.5 items-center justify-center rounded-full border-[1.5px] font-semibold text-[8px] text-white leading-[10px] first:ml-0",
        border === "navy" ? "border-[#0e2235]" : "border-white",
        idx % 2 === 0 ? "bg-[#1f3a5f]" : "bg-[#d77a4a]"
      )}
    >
      {initial}
    </span>
  );
}
