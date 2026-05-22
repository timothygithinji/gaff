/**
 * Centralised TanStack Query keys.
 *
 * Every screen and mutation reads from / writes to the same key shapes,
 * so any drift between a reader and a mutation's `invalidateQueries`
 * silently breaks optimistic updates. Pulling them through this single
 * module turns the keys into typed constants the compiler can lean on.
 *
 * Convention:
 *   - Static keys are zero-arg functions for symmetry with dynamic ones.
 *   - Dynamic keys take the discriminator as a positional arg.
 *   - All return `as const` tuples so TanStack Query's key type narrowing
 *     keeps the literal segments intact.
 */
export const queryKeys = {
  searches: () => ["searches"] as const,
  searchesPortfolio: () => ["searches", "portfolio"] as const,
  search: (id: string) => ["searches", id] as const,
  household: () => ["household"] as const,
  schedules: () => ["schedules"] as const,
  reviewNext: () => ["review", "next"] as const,
  reviewQueue: () => ["review", "queue"] as const,
  reviewTodayStats: () => ["review", "today-stats"] as const,
  reviewRecentSwipes: () => ["review", "recent-swipes"] as const,
  matchesUnread: () => ["matches", "unread"] as const,
  shortlist: () => ["shortlist"] as const,
  shortlistMutual: () => ["shortlist", "mutual"] as const,
  shortlistMine: () => ["shortlist", "mine"] as const,
  shortlistMember: (userId: string) => ["shortlist", "member", userId] as const,
  matches: () => ["matches", "list"] as const,
  listingDetail: (clusterId: string) => ["listings", clusterId] as const,
  admin: {
    metrics: () => ["admin", "metrics"] as const,
    runs: (filter: string) => ["admin", "runs", filter] as const,
    recentRuns: (filter: string) => ["admin", "recent-runs", filter] as const,
    filterCounts: () => ["admin", "filterCounts"] as const,
    schedules: () => ["admin", "schedules"] as const,
    systemStatus: () => ["admin", "systemStatus"] as const,
    spend: () => ["admin", "spend"] as const,
  },
} as const;
