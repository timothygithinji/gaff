/**
 * Re-scrape cadence picker.
 *
 * Renders the current pick as a single-line card with the friendly
 * label only — the cost estimate lives in the sticky footer, not here,
 * so the picker stays uncluttered. Tapping opens a shadcn Dialog with
 * the full preset list.
 */
import {
  ArrowRight01Icon,
  Clock02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  CADENCE_PRESETS,
  type CadencePreset,
  findCadenceById,
} from "../../lib/cron-presets";

type Props = {
  selectedId: string;
  onChange: (id: string) => void;
};

export function CadencePicker({ selectedId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = findCadenceById(selectedId);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger className="flex w-full items-center justify-between rounded-2xl bg-muted px-4 py-4 text-left">
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
            <HugeiconsIcon icon={Clock02Icon} size={18} strokeWidth={1.8} />
          </span>
          <span className="text-foreground text-sm">{labelFor(selected)}</span>
        </span>
        <HugeiconsIcon
          className="text-muted-foreground"
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={2}
        />
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-serif text-foreground text-lg">
          Re-scrape cadence
        </DialogTitle>
        <DialogDescription>
          How often we ping the portals for fresh listings.
        </DialogDescription>
        <ul className="mt-2 divide-y divide-border">
          {CADENCE_PRESETS.map((preset) => {
            const active = preset.id === selected.id;
            return (
              <li key={preset.id}>
                <button
                  className="flex w-full items-center justify-between py-3 text-left"
                  onClick={() => {
                    onChange(preset.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="text-foreground text-sm">
                    {labelFor(preset)}
                  </span>
                  {active && (
                    <HugeiconsIcon
                      className="text-primary"
                      icon={Tick02Icon}
                      size={16}
                      strokeWidth={2.5}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function labelFor(preset: CadencePreset): string {
  if (preset.id === "daily") {
    return "Re-scrape daily";
  }
  if (preset.id === "off") {
    return "Off";
  }
  if (preset.id === "hourly") {
    return "Re-scrape hourly";
  }
  return `Re-scrape ${preset.label.toLowerCase()}`;
}
