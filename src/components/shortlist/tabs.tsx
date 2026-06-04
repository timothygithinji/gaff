/**
 * Shortlist tabs — parameterised by household size.
 *
 *   1 member  → no tabs rendered (caller hides the row entirely).
 *   2 members → `Pipeline · N · Yours · N · <other> · N`
 *   N members → `Pipeline · N · Yours · N · <each member> · N`.
 *
 * Distinct pill row (not shadcn `<Tabs>`) — Paper draws independent
 * chips with the active state inverted (off-white on navy). Two shapes:
 *   - mobile (default): fully-rounded pills.
 *   - desktop (`variant="square"`): 6px-radius chips, sitting in the
 *     page header to the right of the title.
 *
 * The "Pipeline" tab omits its count on desktop (Paper folds the
 * shortlisted count into the header eyebrow there); mobile keeps it.
 */
import { cn } from "../../lib/utils";

export type ShortlistTab = {
  id: string;
  label: string;
  count: number;
};

type Props = {
  tabs: ShortlistTab[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: "pill" | "square";
  /** Tabs whose count should be hidden (desktop Pipeline). */
  hideCountFor?: string[];
};

export function ShortlistTabs({
  tabs,
  activeId,
  onChange,
  variant = "pill",
  hideCountFor,
}: Props) {
  if (tabs.length <= 1) {
    return null;
  }
  const square = variant === "square";
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        !square && "overflow-x-auto px-5 pb-4.5"
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const showCount = !hideCountFor?.includes(tab.id);
        return (
          <button
            className={cn(
              "shrink-0 whitespace-nowrap font-medium text-[13px] leading-4 transition-colors",
              square ? "rounded-md px-3.5 py-2" : "rounded-full px-4 py-2",
              active
                ? "bg-[#0e2235] text-[#eef1f4]"
                : "border border-line bg-card text-navy"
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            {showCount ? `${tab.label} · ${tab.count}` : tab.label}
          </button>
        );
      })}
    </div>
  );
}
