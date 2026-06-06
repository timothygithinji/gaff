/**
 * The 3 / 5 / 7-day picker that backs every "Defer" control.
 *
 * Deferring isn't a single click — the user chooses how long to wait
 * before the listing re-scrapes and re-surfaces. This wraps the shared
 * dropdown so both the mobile action dock and the desktop action stack
 * present the same window choices from their own trigger button. The
 * caller passes its styled trigger element via `trigger`.
 */
import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/** Offered defer windows, in days. */
export const DEFER_WINDOWS = [3, 5, 7] as const;

type Props = {
  /** The styled button that opens the menu (passed to the trigger). */
  trigger: ReactElement;
  onDefer: (days: number) => void;
  /** Which edge to anchor the popover to (mobile docks at the bottom). */
  side?: "top" | "bottom";
};

export function DeferMenu({ trigger, onDefer, side = "top" }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="center" side={side} sideOffset={10}>
        <DropdownMenuLabel>Re-check this listing in…</DropdownMenuLabel>
        {DEFER_WINDOWS.map((days) => (
          <DropdownMenuItem key={days} onClick={() => onDefer(days)}>
            {days} days
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
