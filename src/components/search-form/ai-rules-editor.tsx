/**
 * AI floor-plan rules toggle list + custom rule textarea.
 *
 * Presets are the hard-coded list of "things Claude reads every floor
 * plan against" from the design. Users can toggle each on/off and add
 * free-form custom rules (which get appended to the AI prompt verbatim
 * in PR 6). Custom rules carry their own id (`custom:<nanoid>`) so the
 * server function can persist them in the same `aiRules` jsonb shape.
 */
import { nanoid } from "nanoid";
import { useState } from "react";

export type AiRule = {
  id: string;
  label: string;
  body?: string;
  enabled: boolean;
  customPrompt?: string;
};

export const DEFAULT_AI_RULES: AiRule[] = [
  {
    id: "separate-kitchen",
    label: "Separate kitchen",
    body: "Not open-plan",
    enabled: true,
  },
  {
    id: "bedrooms-fit-double",
    label: "Both bedrooms fit a double",
    body: "Min 9 m² per bed",
    enabled: true,
  },
  {
    id: "dual-aspect-living",
    label: "Dual-aspect living room",
    body: "Windows on two sides — natural light",
    enabled: true,
  },
  {
    id: "real-storage",
    label: "Real storage",
    body: "Built-in wardrobes or utility",
    enabled: false,
  },
];

type Props = {
  rules: AiRule[];
  onChange: (next: AiRule[]) => void;
};

export function AiRulesEditor({ rules, onChange }: Props) {
  const [addingCustom, setAddingCustom] = useState(false);
  const [draft, setDraft] = useState("");

  const submitCustom = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAddingCustom(false);
      setDraft("");
      return;
    }
    const next: AiRule = {
      id: `custom:${nanoid(8)}`,
      label: trimmed,
      customPrompt: trimmed,
      enabled: true,
    };
    onChange([...rules, next]);
    setDraft("");
    setAddingCustom(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-bone">
      <ul className="divide-y divide-brass/10">
        {rules.map((rule) => (
          <li
            className="flex items-center justify-between px-5 py-4"
            key={rule.id}
          >
            <div className="min-w-0 pr-4">
              <p className="text-ink text-sm">{rule.label}</p>
              {rule.body && (
                <p className="mt-0.5 text-brass text-xs">{rule.body}</p>
              )}
            </div>
            <ToggleSwitch
              checked={rule.enabled}
              onChange={(checked) =>
                onChange(
                  rules.map((r) =>
                    r.id === rule.id ? { ...r, enabled: checked } : r
                  )
                )
              }
            />
          </li>
        ))}
      </ul>
      {addingCustom ? (
        <div className="border-brass/10 border-t px-5 py-4">
          <textarea
            autoFocus
            className="w-full resize-none rounded-md border border-brass/20 bg-paper p-3 text-ink text-sm outline-none focus:border-copper/60"
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Bathroom has a window"
            rows={3}
            value={draft}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              className="rounded-md px-3 py-1.5 text-brass text-xs"
              onClick={() => {
                setAddingCustom(false);
                setDraft("");
              }}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-copper px-3 py-1.5 text-bone text-xs disabled:opacity-50"
              disabled={!draft.trim()}
              onClick={submitCustom}
              type="button"
            >
              Add rule
            </button>
          </div>
        </div>
      ) : (
        <button
          className="flex w-full items-center justify-center border-brass/10 border-t px-5 py-4 text-copper text-sm"
          onClick={() => setAddingCustom(true)}
          type="button"
        >
          + Add custom rule
        </button>
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // A real <input type="checkbox"> with role="switch" so the implicit
  // ARIA semantics (checked state, keyboard activation, screen-reader
  // announcement) come for free — Biome's
  // `useAriaPropsSupportedByRole` rejects `aria-checked` on a plain
  // <button>, but an <input role="switch"> is the canonical pattern.
  return (
    <label className="relative inline-block h-6 w-11 flex-shrink-0">
      <input
        checked={checked}
        className="peer sr-only"
        onChange={(e) => onChange(e.target.checked)}
        type="checkbox"
      />
      <span
        aria-hidden
        className={
          checked
            ? "block h-full w-full rounded-full bg-copper transition-colors"
            : "block h-full w-full rounded-full bg-brass/30 transition-colors"
        }
      />
      <span
        aria-hidden
        className={
          checked
            ? "absolute top-0.5 left-[22px] h-5 w-5 rounded-full bg-paper shadow transition-all"
            : "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-paper shadow transition-all"
        }
      />
    </label>
  );
}
