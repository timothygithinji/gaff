/**
 * Three-portal toggle row.
 *
 * Selected portals are ink-on-bone with a copper check; unselected are
 * brass-on-paper. At least one must be active for the form to submit —
 * the validation lives in the parent Zod schema but the empty-state is
 * also visually suppressed (no submit if no portals lit).
 */
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
                ? "inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-medium text-bone text-sm"
                : "inline-flex items-center gap-1.5 rounded-full border border-brass/30 bg-paper px-4 py-2 text-brass text-sm"
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
            <span aria-hidden>{active ? "✓" : ""}</span>
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
