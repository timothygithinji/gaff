/**
 * Shared React Query options for the household's deferred listings.
 *
 * Read by the `/deferred` management page and by the small "Deferred · N"
 * affordances in the review chrome (mobile header + desktop avatar menu).
 * One query key → one fetch → the count and the list never disagree.
 */
import { listDeferrals } from "../server/functions/deferrals";

export const deferralsQueryOptions = {
  queryKey: ["deferrals", "list"] as const,
  queryFn: () => listDeferrals(),
  staleTime: 30_000,
};
