/**
 * AI floor-plan rules toggle list + custom rule textarea.
 *
 * Presets are the hard-coded list of "things Claude reads every floor
 * plan against" from the design. Users can toggle each on/off and add
 * free-form custom rules (which get appended to the AI prompt verbatim
 * in PR 6). Custom rules carry their own id (`custom:<nanoid>`) so the
 * server function can persist them in the same `aiRules` jsonb shape.
 */
import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { nanoid } from "nanoid";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";

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
    <div className="overflow-hidden rounded-2xl bg-muted">
      <ul className="divide-y divide-border">
        {rules.map((rule) => (
          <li
            className="flex items-center justify-between px-5 py-4"
            key={rule.id}
          >
            <div className="min-w-0 pr-4">
              <p className="text-foreground text-sm">{rule.label}</p>
              {rule.body && (
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {rule.body}
                </p>
              )}
            </div>
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) =>
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
        <div className="border-border border-t px-5 py-4">
          <textarea
            autoFocus
            className="w-full resize-none rounded-md border border-border bg-card p-3 text-foreground text-sm outline-none focus:border-primary/60"
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Bathroom has a window"
            rows={3}
            value={draft}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              onClick={() => {
                setAddingCustom(false);
                setDraft("");
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={!draft.trim()}
              onClick={submitCustom}
              size="sm"
              type="button"
            >
              Add rule
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="flex w-full items-center justify-center gap-1.5 border-border border-t px-5 py-4 text-primary text-sm"
          onClick={() => setAddingCustom(true)}
          type="button"
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
          Add custom rule
        </button>
      )}
    </div>
  );
}
