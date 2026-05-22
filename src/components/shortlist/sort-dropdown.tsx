/**
 * Sort dropdown — right-aligned next to the "Other mutual picks"
 * eyebrow. Two options for v1: cheapest (default) and newest. "Biggest
 * commute saving" lives on the v1.1 roadmap (requires commute deltas
 * per cluster which we don't compute yet).
 *
 * Built on Radix DropdownMenu so the trigger lifts focus and supports
 * keyboard navigation out of the box.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export type SortKey = "cheapest" | "newest";

const OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "cheapest", label: "Sort: cheapest" },
  { id: "newest", label: "Sort: newest" },
];

type Props = {
  value: SortKey;
  onChange: (value: SortKey) => void;
};

export function SortDropdown({ value, onChange }: Props) {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="font-medium text-[11px] text-copper" type="button">
          {current?.label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-[160px] rounded-xl border border-[#E5DDD0] bg-paper p-1 shadow-lg"
          sideOffset={6}
        >
          {OPTIONS.map((opt) => (
            <DropdownMenu.Item
              className={
                opt.id === value
                  ? "cursor-pointer rounded-lg bg-copper/10 px-3 py-2 text-copper text-sm outline-none"
                  : "cursor-pointer rounded-lg px-3 py-2 text-ink text-sm outline-none hover:bg-ground"
              }
              key={opt.id}
              onSelect={() => onChange(opt.id)}
            >
              {opt.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
