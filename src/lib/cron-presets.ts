/**
 * Cron presets for the per-search scrape cadence picker.
 *
 * Cadence isn't stored in our DB — it lives on Trigger.dev as an
 * imperative schedule keyed by `externalId = search.id`. The UI maps
 * between friendly labels and cron strings here so the form layer never
 * has to know the underlying expression, and so the same labels can be
 * reused by the admin schedules screen (PR 9.5).
 *
 * "Off" is special: it means the search exists but has no schedule.
 * `cron: null` is the sentinel — server functions interpret it as
 * `active = false` and skip schedule creation / deactivate an existing
 * schedule.
 *
 * Anchored cadences ("Daily", "Every 12h") run at a user-chosen hour of
 * the day. That hour isn't a fixed string — it's composed into the cron
 * by `buildCron(id, hour)` and recovered by `parseCron(cron)`, so the
 * exact expression varies per search. Everything that needs to read a
 * cadence back from a cron (the maxDaysSinceAdded window, the list
 * labels) goes through `parseCron` rather than matching strings.
 */
export type CadencePreset = {
  /** Stable, URL-safe key. */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  /** Cron expression at the default anchor hour, or `null` for "Off". */
  cron: string | null;
  /** How many scrapes per day this preset triggers — drives cost estimate. */
  scrapesPerDay: number;
  /**
   * Cap on listing age (days) to request from portals that support it
   * (currently only Rightmove via `maxDaysSinceAdded`). Picked from the
   * cadence so faster schedules pull tighter windows — avoids re-ingesting
   * weeks-old listings on every scrape. `undefined` means "don't pass the
   * param" (the right behaviour for "off", since off shouldn't run anyway).
   */
  maxDaysSinceAdded?: number;
  /**
   * Whether a user-chosen time-of-day applies. True for cadences with a
   * daily anchor ("Daily" runs once at hour H; "Every 12h" runs at H and
   * H+12). Interval cadences (hourly, 4h, …) run every N hours regardless,
   * so the time picker is hidden and `buildCron` ignores the hour.
   */
  anchored: boolean;
};

/** Default hour-of-day for anchored cadences — preserves the old 7am behaviour. */
export const DEFAULT_ANCHOR_HOUR = 7;

const DEFAULT_PRESET: CadencePreset = {
  id: "daily",
  label: "Daily",
  cron: `0 ${DEFAULT_ANCHOR_HOUR} * * *`,
  scrapesPerDay: 1,
  maxDaysSinceAdded: 7,
  anchored: true,
};

export const CADENCE_PRESETS: CadencePreset[] = [
  DEFAULT_PRESET,
  {
    id: "12h",
    label: "Every 12h",
    cron: "0 7,19 * * *",
    scrapesPerDay: 2,
    maxDaysSinceAdded: 7,
    anchored: true,
  },
  {
    id: "6h",
    label: "Every 6h",
    cron: "0 */6 * * *",
    scrapesPerDay: 4,
    maxDaysSinceAdded: 3,
    anchored: false,
  },
  {
    id: "4h",
    label: "Every 4h",
    cron: "0 */4 * * *",
    scrapesPerDay: 6,
    maxDaysSinceAdded: 3,
    anchored: false,
  },
  {
    id: "2h",
    label: "Every 2h",
    cron: "0 */2 * * *",
    scrapesPerDay: 12,
    maxDaysSinceAdded: 3,
    anchored: false,
  },
  {
    id: "hourly",
    label: "Hourly",
    cron: "0 * * * *",
    scrapesPerDay: 24,
    maxDaysSinceAdded: 1,
    anchored: false,
  },
  { id: "off", label: "Off", cron: null, scrapesPerDay: 0, anchored: false },
];

/** Clamp an arbitrary number to a valid 0–23 hour. */
function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) {
    return DEFAULT_ANCHOR_HOUR;
  }
  return Math.min(23, Math.max(0, Math.trunc(hour)));
}

/**
 * Compose the cron for a cadence at a given anchor hour (0–23).
 *
 * For "off" returns `null`. For interval cadences the hour is ignored
 * (they already run every N hours). For "daily" → `0 H * * *`; for "12h"
 * → `0 H,(H+12) * * *` with the two hours written in ascending order.
 */
export function buildCron(id: string, hour: number): string | null {
  const preset = findCadenceById(id);
  if (preset.cron === null) {
    return null;
  }
  if (!preset.anchored) {
    return preset.cron;
  }
  const h = clampHour(hour);
  if (id === "12h") {
    const other = (h + 12) % 24;
    const [a, b] = h <= other ? [h, other] : [other, h];
    return `0 ${a},${b} * * *`;
  }
  return `0 ${h} * * *`;
}

const CRON_WHITESPACE = /\s+/;

/** Interval `hour` cron fields → cadence id (these ignore the anchor hour). */
const INTERVAL_HOUR_FIELDS: Record<string, string> = {
  "*": "hourly",
  "*/2": "2h",
  "*/4": "4h",
  "*/6": "6h",
};

function isHour(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 23;
}

/**
 * For a "Every 12h" cron `hour` field (e.g. "7,19"), return the lower of the
 * two hours when they're a valid pair exactly 12 apart, else `null`.
 */
function twelveHourAnchor(hourField: string): number | null {
  if (!hourField.includes(",")) {
    return null;
  }
  const hrs = hourField.split(",").map(Number);
  const [first, second] = hrs;
  if (
    hrs.length !== 2 ||
    typeof first !== "number" ||
    typeof second !== "number" ||
    !hrs.every(isHour)
  ) {
    return null;
  }
  const lo = Math.min(first, second);
  return Math.max(first, second) - lo === 12 ? lo : null;
}

/**
 * Recover `{ id, hour }` from a cron expression (or `null` = off).
 *
 * Parses structurally rather than matching fixed strings so anchored
 * cadences round-trip at any user-chosen hour. Falls back to the default
 * daily preset for anything unrecognised.
 */
export function parseCron(cron: string | null): { id: string; hour: number } {
  if (cron === null) {
    return { id: "off", hour: DEFAULT_ANCHOR_HOUR };
  }
  const parts = cron.trim().split(CRON_WHITESPACE);
  const hourField = parts[1];
  if (parts.length !== 5 || parts[0] !== "0" || !hourField) {
    return { id: "daily", hour: DEFAULT_ANCHOR_HOUR };
  }
  const interval = INTERVAL_HOUR_FIELDS[hourField];
  if (interval) {
    return { id: interval, hour: DEFAULT_ANCHOR_HOUR };
  }
  const twelve = twelveHourAnchor(hourField);
  if (twelve !== null) {
    return { id: "12h", hour: twelve };
  }
  const single = Number(hourField);
  if (isHour(single)) {
    return { id: "daily", hour: single };
  }
  return { id: "daily", hour: DEFAULT_ANCHOR_HOUR };
}

export function findCadenceByCron(cron: string | null): CadencePreset {
  return findCadenceById(parseCron(cron).id);
}

export function findCadenceById(id: string): CadencePreset {
  return CADENCE_PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
}
