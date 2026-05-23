import {
  formatForDisplay,
  formatHotkeySequence,
  getHotkeyManager,
  getSequenceManager,
} from "@tanstack/react-hotkeys";
import { useMemo, useState } from "react";
import { useAppHotkeys } from "../hooks/use-app-hotkeys";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Kbd, KbdGroup } from "./ui/kbd";

type ShortcutRow = {
  id: string;
  description: string;
  tokens: string[];
};

type ShortcutGroup = {
  category: string;
  rows: ShortcutRow[];
};

// Category display order. Anything unknown sorts to the end alphabetically.
const CATEGORY_ORDER = ["Navigation", "Review", "Theme", "App"] as const;

// `formatForDisplay` and `formatHotkeySequence` separate tokens with one or
// more spaces; split on that to render each chunk as its own <Kbd>.
const TOKEN_SEPARATOR = /\s+/;

export function HotkeyHelp() {
  const [open, setOpen] = useState(false);
  useAppHotkeys(() => setOpen(true));

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-serif text-foreground text-lg">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription>
          Press a sequence anywhere in the app — except while typing in a field.
        </DialogDescription>
        {open ? <ShortcutList /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Reads the singleton hotkey + sequence registrations once on mount and
 * renders them grouped by `meta.category`. We snapshot rather than
 * subscribing because the library's `useHotkey` calls `setOptions` on
 * every render of its caller, and `setOptions` always mutates the
 * registration store — a live subscription here would re-render this
 * component on every parent re-render, which in turn would cascade
 * back into more `setOptions` calls and lock the main thread.
 *
 * Only mounted while the dialog is open, so the snapshot is taken at
 * the moment the user asks to see the shortcut list and discarded when
 * they close the dialog.
 */
function ShortcutList() {
  const groups = useMemo(
    () =>
      groupShortcuts({
        hotkeys: getHotkeyManager().registrations.state,
        sequences: getSequenceManager().registrations.state,
      }),
    []
  );

  return (
    <div className="mt-3 space-y-4">
      {groups.map((group) => (
        <section key={group.category}>
          <h3 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {group.category}
          </h3>
          <ul className="divide-y divide-border">
            {group.rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-foreground">{row.description}</span>
                <ShortcutKeys tokens={row.tokens} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ShortcutKeys({ tokens }: { tokens: string[] }) {
  if (tokens.length === 1) {
    return <Kbd>{tokens[0]}</Kbd>;
  }
  return (
    <KbdGroup>
      {tokens.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

function groupShortcuts(snapshot: {
  hotkeys: Map<
    string,
    {
      hotkey: unknown;
      options: { meta?: { description?: string; category?: string } };
    }
  >;
  sequences: Map<
    string,
    {
      sequence: unknown;
      options: { meta?: { description?: string; category?: string } };
    }
  >;
}): ShortcutGroup[] {
  const byCategory = new Map<string, ShortcutRow[]>();

  for (const [id, reg] of snapshot.hotkeys) {
    const description = reg.options.meta?.description;
    if (!description) {
      continue;
    }
    const category = reg.options.meta?.category ?? "Other";
    const display = formatForDisplay(
      reg.hotkey as Parameters<typeof formatForDisplay>[0]
    );
    const list = byCategory.get(category) ?? [];
    list.push({ id, description, tokens: display.split(TOKEN_SEPARATOR) });
    byCategory.set(category, list);
  }

  for (const [id, reg] of snapshot.sequences) {
    const description = reg.options.meta?.description;
    if (!description) {
      continue;
    }
    const category = reg.options.meta?.category ?? "Other";
    const formatted = formatHotkeySequence(
      reg.sequence as Parameters<typeof formatHotkeySequence>[0]
    );
    const list = byCategory.get(category) ?? [];
    list.push({ id, description, tokens: formatted.split(TOKEN_SEPARATOR) });
    byCategory.set(category, list);
  }

  return Array.from(byCategory.entries())
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b))
    .map(([category, rows]) => ({
      category,
      rows: rows.sort((x, y) => x.description.localeCompare(y.description)),
    }));
}

function categoryRank(category: string): number {
  const idx = CATEGORY_ORDER.indexOf(
    category as (typeof CATEGORY_ORDER)[number]
  );
  // Unknown categories sort after known ones, alphabetically.
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}
