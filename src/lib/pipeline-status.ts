/**
 * Pipeline status constants + types.
 *
 * Lives in `src/lib/` (not `src/server/functions/`) so the UI can
 * import these without dragging the server-side module graph (DB,
 * session helpers, `cloudflare:workers`) into the client bundle.
 *
 * `src/server/functions/pipeline.ts` re-uses the same constants on the
 * server so the wire-shape stays in lockstep with the UI.
 */

export const PIPELINE_STATUSES = [
  "shortlisted",
  "contacted",
  "viewing_booked",
  "offer_made",
  "archived",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PIPELINE_ARCHIVED_REASONS = [
  "accepted",
  "passed",
  "let_to_someone_else",
  "withdrawn",
  "other",
] as const;
export type PipelineArchivedReason = (typeof PIPELINE_ARCHIVED_REASONS)[number];
