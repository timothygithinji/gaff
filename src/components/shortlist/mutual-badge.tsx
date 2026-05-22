/**
 * Mutual-badge — small pill that headlines a mutual match card with an
 * avatar stack + "BOTH KEPT" / "ALL N KEPT" copy + an age string.
 *
 * Copy varies by household size:
 *   - 1 member  → don't render (callers should branch). Returns null
 *     defensively if invoked.
 *   - 2 members → "BOTH KEPT · <age>"
 *   - N members → "ALL N KEPT · <age>" with stacked avatars.
 *
 * Avatars are rendered from each member's initial, coloured copper /
 * brass / sand in alternation. The stack offsets by -6px to mimic the
 * Paper artboard's overlap.
 */
import type { ShortlistMember } from "../../server/functions/shortlist";

type Props = {
  members: ShortlistMember[];
  memberCount: number;
  /** Pre-formatted "2h ago" / "yesterday" / "3 days ago" string. */
  ageLabel: string;
};

const AVATAR_BG = ["bg-copper", "bg-[#C8A878]", "bg-brass", "bg-ink"];

export function MutualBadge({ members, memberCount, ageLabel }: Props) {
  if (memberCount <= 1) {
    return null;
  }
  const label = memberCount === 2 ? "Both kept" : `All ${memberCount} kept`;

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brass py-1.5 pr-3 pl-2">
      <span className="flex items-center">
        {members.slice(0, 4).map((m, idx) => (
          <span
            className={`-ml-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-brass font-bold text-[9px] text-bone first:ml-0 ${AVATAR_BG[idx % AVATAR_BG.length]}`}
            key={m.userId}
          >
            {m.emailInitial}
          </span>
        ))}
      </span>
      <span className="font-bold text-[10px] text-bone uppercase tracking-widest">
        {label} · {ageLabel}
      </span>
    </span>
  );
}

/**
 * Tiny avatar stack used inside compact list rows. Same colours; smaller
 * footprint; rendered against a `bg-paper` row so the avatar borders are
 * paper-coloured rather than brass.
 */
export function CompactAvatarStack({
  members,
}: {
  members: ShortlistMember[];
}) {
  return (
    <span className="flex items-center">
      {members.slice(0, 4).map((m, idx) => (
        <span
          className={`-ml-1.25 flex h-3.5 w-3.5 items-center justify-center rounded-full border-[1.5px] border-paper font-bold text-[7px] text-bone first:ml-0 ${AVATAR_BG[idx % AVATAR_BG.length]}`}
          key={m.userId}
        >
          {m.emailInitial}
        </span>
      ))}
    </span>
  );
}
