/**
 * Shortlist tabs — parameterised by household size.
 *
 *   1 member  → no tabs rendered (caller hides the row entirely).
 *   2 members → `Mutual N · Yours N · <other>'s N`
 *   N members → `Mutual N · Yours N · <each member>'s N` per non-current member.
 *
 * Counts are passed in from the parent (it already runs three queries
 * for mutual / mine / each-other-member, so it owns the numbers).
 */

export type ShortlistTab = {
  id: string;
  label: string;
  count: number;
};

type Props = {
  tabs: ShortlistTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function ShortlistTabs({ tabs, activeId, onChange }: Props) {
  if (tabs.length <= 1) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-6 pb-4.5">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            className={
              active
                ? "shrink-0 rounded-full bg-ink px-3.5 py-2 font-semibold text-bone text-xs"
                : "shrink-0 rounded-full border border-[#E5DDD0] bg-paper px-3.5 py-2 font-medium text-ink text-xs"
            }
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {tab.label} {tab.count}
          </button>
        );
      })}
    </div>
  );
}
