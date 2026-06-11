/**
 * Sort dropdown — right-aligned next to the "Other mutual picks"
 * eyebrow. Two options for v1: newest (default) and cheapest.
 *
 * Built on our `DropdownMenu` (`@base-ui` Menu under the hood), whose
 * `Menu.Item` activates via `onClick` — NOT Radix's `onSelect`, which is
 * silently ignored here.
 */
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

export type SortKey = "cheapest" | "newest";

const OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "newest", label: "Sort: newest" },
  { id: "cheapest", label: "Sort: cheapest" },
];

type Props = {
  value: SortKey;
  onChange: (value: SortKey) => void;
};

export function SortDropdown({ value, onChange }: Props) {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 font-medium text-[11px] text-primary">
        {current?.label}
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onClick={() => onChange(opt.id)}
            data-active={opt.id === value}
            className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
