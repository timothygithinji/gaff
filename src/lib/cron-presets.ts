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
 */
export type CadencePreset = {
  /** Stable, URL-safe key. */
  id: string;
  /** Human label shown in the picker. */
  label: string;
  /** Cron expression, or `null` for the explicit "Off" option. */
  cron: string | null;
  /** How many scrapes per day this preset triggers — drives cost estimate. */
  scrapesPerDay: number;
};

const DEFAULT_PRESET: CadencePreset = {
  id: "daily",
  label: "Daily",
  cron: "0 7 * * *",
  scrapesPerDay: 1,
};

export const CADENCE_PRESETS: CadencePreset[] = [
  DEFAULT_PRESET,
  { id: "12h", label: "Every 12h", cron: "0 7,19 * * *", scrapesPerDay: 2 },
  { id: "6h", label: "Every 6h", cron: "0 */6 * * *", scrapesPerDay: 4 },
  { id: "4h", label: "Every 4h", cron: "0 */4 * * *", scrapesPerDay: 6 },
  { id: "2h", label: "Every 2h", cron: "0 */2 * * *", scrapesPerDay: 12 },
  { id: "hourly", label: "Hourly", cron: "0 * * * *", scrapesPerDay: 24 },
  { id: "off", label: "Off", cron: null, scrapesPerDay: 0 },
];

export const DEFAULT_CADENCE_ID = DEFAULT_PRESET.id;

export function findCadenceByCron(cron: string | null): CadencePreset {
  if (cron === null) {
    return CADENCE_PRESETS.find((p) => p.id === "off") ?? DEFAULT_PRESET;
  }
  return CADENCE_PRESETS.find((p) => p.cron === cron) ?? DEFAULT_PRESET;
}

export function findCadenceById(id: string): CadencePreset {
  return CADENCE_PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
}
