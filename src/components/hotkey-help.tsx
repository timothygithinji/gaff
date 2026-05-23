import {
  formatForDisplay,
  formatHotkeySequence,
  getHotkeyManager,
  getSequenceManager,
} from "@tanstack/hotkeys";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
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
  const groups = useShortcutGroups();

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle className="font-serif text-foreground text-lg">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription>
          Press a sequence anywhere in the app — except while typing in a field.
        </DialogDescription>
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
      </DialogContent>
    </Dialog>
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

/**
 * Read every registration from the singleton hotkey + sequence managers
 * and return them grouped by `meta.category`. Re-renders when registrations
 * appear, disappear, or change `enabled` (the stores update on every mount/
 * unmount).
 *
 * Registrations without a `meta.description` are ignored — that's the
 * library's convention for "internal" registrations we don't want surfaced.
 */
function useShortcutGroups(): ShortcutGroup[] {
  const hotkeyStore = getHotkeyManager().registrations;
  const sequenceStore = getSequenceManager().registrations;

  const subscribe = useCallback(
    (cb: () => void) => {
      const a = hotkeyStore.subscribe(cb);
      const b = sequenceStore.subscribe(cb);
      return () => {
        a.unsubscribe();
        b.unsubscribe();
      };
    },
    [hotkeyStore, sequenceStore]
  );
  const getSnapshot = useCallback(
    // Stable identity per store version — useSyncExternalStore expects the
    // snapshot to compare strictly equal when nothing has changed, and the
    // store guarantees that the Map identity changes on every update.
    () => ({
      hotkeys: hotkeyStore.state,
      sequences: sequenceStore.state,
    }),
    [hotkeyStore, sequenceStore]
  );
  const getServerSnapshot = useCallback(() => EMPTY_SNAPSHOT, []);
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  return useMemo(() => groupShortcuts(snapshot), [snapshot]);
}

const EMPTY_SNAPSHOT = {
  hotkeys: new Map(),
  sequences: new Map(),
};

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
