/**
 * Pure conflict-resolution rules for merging two property clusters that
 * turn out to be the same physical home (cross-portal duplicates).
 *
 * When a user has swiped BOTH clusters (they were shown the same flat
 * twice), merging has to collapse the two swipe rows into one. The rule
 * preserves the household's blind veto (see the roadmap): a `skip` on
 * either side wins, then `shortlist` (positive interest), then `keep`.
 *
 * The DB orchestration (reading rows, building the batch, deleting the
 * absorbed cluster) lives in `src/server/functions/clusters.ts`; this
 * module is just the decision functions so they're unit-testable.
 */

import type { swipeOutcomeEnum } from "../../../db/schema";

export type SwipeOutcome = (typeof swipeOutcomeEnum.enumValues)[number];

const SWIPE_RANK: Record<SwipeOutcome, number> = {
  skip: 2, // veto wins
  shortlist: 1,
  keep: 0,
};

/**
 * The surviving outcome when one user has swiped both clusters. Veto
 * (`skip`) beats `shortlist` beats `keep`; ties keep the first argument
 * (treated as the incumbent/survivor row).
 */
export function resolveSwipeOutcome(
  incumbent: SwipeOutcome,
  incoming: SwipeOutcome
): SwipeOutcome {
  return SWIPE_RANK[incoming] > SWIPE_RANK[incumbent] ? incoming : incumbent;
}

/**
 * When both clusters carry a shortlist-pipeline row for the same
 * household, the more recently moved row wins (it reflects the latest
 * decision). Returns true when the incoming (absorbed) row should
 * replace the incumbent (survivor) row.
 */
export function pipelineIncomingWins(
  incumbentLastMovedAt: Date,
  incomingLastMovedAt: Date
): boolean {
  return incomingLastMovedAt.getTime() > incumbentLastMovedAt.getTime();
}
