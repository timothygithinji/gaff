/**
 * Shared React Query options for a cluster's full listing-detail payload.
 *
 * One factory, many readers: the `/listings/$clusterId` page, the
 * `/compare` split view, and the duplicate-compare panel all pull the
 * same `getListingDetail` payload under the same key. Centralising it
 * here also lets the Review queue rail and Shortlist cards
 * `prefetchQuery(listingDetailQueryOptions(id))` on hover — those screens
 * open the detail page via an imperative `navigate()`, which bypasses the
 * router's intent-preload, so without a manual prefetch the click pays the
 * full payload latency cold.
 */
import { getListingDetail } from "../server/functions/listing-detail";
import { queryKeys } from "./query-keys";

export const listingDetailQueryOptions = (clusterId: string) =>
  ({
    queryKey: queryKeys.listingDetail(clusterId),
    queryFn: () => getListingDetail({ data: { clusterId } }),
    // Swipes from other household members can change `partnerSwipes`
    // without a navigation; re-validate on focus.
    staleTime: 15_000,
  }) as const;
