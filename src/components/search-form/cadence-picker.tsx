/**
 * Re-scrape cadence picker.
 *
 * Renders the current pick as a single-line card (matching the design)
 * with the friendly label + "Est. cost · $X / day" beneath. Tapping
 * opens a Radix Dialog with the full preset list so the picker doesn't
 * dominate the form's vertical rhythm.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { formatUsd } from "../../lib/cost-estimate";
import {
  CADENCE_PRESETS,
  type CadencePreset,
  findCadenceById,
} from "../../lib/cron-presets";

type Props = {
  selectedId: string;
  onChange: (id: string) => void;
  /** $ per day for the currently selected cadence — drives the sub-label. */
  perDayUsd: number;
};

export function CadencePicker({ selectedId, onChange, perDayUsd }: Props) {
  const [open, setOpen] = useState(false);
  const selected = findCadenceById(selectedId);

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Trigger asChild>
        <button
          className="flex w-full items-center justify-between rounded-2xl bg-bone px-4 py-4 text-left"
          type="button"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-copper/15">
              <span className="text-copper">◷</span>
            </span>
            <span>
              <span className="block text-ink text-sm">
                {labelFor(selected)}
              </span>
              <span className="block text-brass text-xs">
                {selected.cron === null
                  ? "No scraping — paused"
                  : `Est. cost · ${formatUsd(perDayUsd)} / day`}
              </span>
            </span>
          </span>
          <span className="text-brass">›</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="-translate-x-1/2 fixed bottom-0 left-1/2 z-50 w-full max-w-md rounded-t-2xl bg-paper p-6 shadow-xl">
          <Dialog.Title className="font-serif text-ink text-lg">
            Re-scrape cadence
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-brass text-sm">
            How often we ping the portals for fresh listings.
          </Dialog.Description>
          <ul className="mt-4 divide-y divide-brass/10">
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
                    <span className="text-ink text-sm">{labelFor(preset)}</span>
                    {active && <span className="text-copper text-sm">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
