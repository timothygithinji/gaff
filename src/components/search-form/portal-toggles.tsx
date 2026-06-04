/**
 * Portal toggle rows.
 *
 * Each portal is a mist-filled row: the real portal logo (via
 * `PortalLogo`, with an initial fallback), the portal name, and a copper
 * switch — matching the Paper "Portals to watch" card. At least one
 * portal must stay on for the form to submit (enforced by the parent Zod
 * validator).
 */
import type { Portal } from "../../lib/cost-estimate";
import { cn } from "../../lib/utils";
import { PortalLogo } from "../portal-logo";

const PORTALS: Array<{ id: Portal; label: string }> = [
  { id: "rightmove", label: "Rightmove" },
  { id: "zoopla", label: "Zoopla" },
  { id: "openrent", label: "OpenRent" },
];

type Props = {
  selected: Portal[];
  onChange: (next: Portal[]) => void;
};

export function PortalToggles({ selected, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {PORTALS.map((p) => {
        const active = selected.includes(p.id);
        return (
          <button
            aria-pressed={active}
            className="flex items-center justify-between rounded-md bg-mist px-3 py-2.5 text-left"
            key={p.id}
            onClick={() => {
              if (active) {
                onChange(selected.filter((s) => s !== p.id));
              } else {
                onChange([...selected, p.id]);
              }
            }}
            type="button"
          >
            <span className="flex items-center gap-2.5">
              <PortalLogo portal={p.id} />
              <span className="text-[13px] text-navy">{p.label}</span>
            </span>
            <Switch on={active} />
          </button>
        );
      })}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative h-4.5 w-8 shrink-0 rounded-full transition-colors",
        on ? "bg-copper" : "bg-line"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full bg-white transition-all",
          on ? "right-0.5" : "left-0.5"
        )}
      />
    </span>
  );
}
