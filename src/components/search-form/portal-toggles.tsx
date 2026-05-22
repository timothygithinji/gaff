/**
 * Three-portal toggle row.
 *
 * Selected portals are foreground-on-background with a primary check;
 * unselected are muted on card. At least one must be active for the form
 * to submit — validation lives in the parent Zod schema.
 */
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Portal } from "../../lib/cost-estimate";

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
    <div className="flex flex-wrap gap-2">
      {PORTALS.map((p) => {
        const active = selected.includes(p.id);
        return (
          <button
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 font-medium text-background text-sm"
                : "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-muted-foreground text-sm"
            }
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
            {active ? (
              <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} />
            ) : null}
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
