/**
 * Sort dropdown — right-aligned next to the "Other mutual picks"
 * eyebrow. Two options for v1: cheapest (default) and newest.
 *
 * Built on shadcn's DropdownMenu (Radix under the hood) so the trigger
 * lifts focus and supports keyboard navigation out of the box.
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
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 font-medium text-[11px] text-primary">
        {current?.label}
        <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onSelect={() => onChange(opt.id)}
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
