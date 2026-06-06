/**
 * Shared React Query options for the merge-duplicates suggestions.
 *
 * Lives here (not inline in the route) because two places read it: the
 * `/settings/duplicates` page itself and the settings sub-nav badge, which
 * shows the outstanding-group count from any settings screen. One query
 * key → one fetch → the badge and the page never disagree.
 */
import { listDuplicateSuggestions } from "../server/functions/clusters";
import { queryKeys } from "./query-keys";

export const duplicatesQueryOptions = {
  queryKey: queryKeys.duplicates(),
  queryFn: () => listDuplicateSuggestions(),
  staleTime: 30_000,
};
