/**
 * Shared React Query options for the merge-duplicates suggestions.
 *
 * Lives here (not inline in the route) so anything that needs the
 * outstanding-group count shares one query key → one fetch → no disagreement.
 * Currently read by the `/merge` page (reached from the account
 * dropdown). The query loads the household's photo signals, so keep it off
 * always-mounted chrome.
 */
import { listDuplicateSuggestions } from "../server/functions/clusters";
import { queryKeys } from "./query-keys";

export const duplicatesQueryOptions = {
  queryKey: queryKeys.duplicates(),
  queryFn: () => listDuplicateSuggestions(),
  staleTime: 30_000,
};
