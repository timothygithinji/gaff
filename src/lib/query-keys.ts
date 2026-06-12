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
 *
 * Prefix vs. leaf — the footgun this module exists to prevent:
 *   A zero-arg call to a *dynamic* leaf key (e.g. `reviewNext()`) returns
 *   a fully-specified tuple with `null` discriminators (`["review",
 *   "next", null]`), which `invalidateQueries` matches *exactly* —
 *   it will NOT sweep the scoped variants (`["review","next",<clusterId>,
 *   …]`). To invalidate a whole family, pass the broad-prefix helper
 *   (`review()`, `shortlist()`, `deferrals()`) instead. Readers keep
 *   using the leaf keys with their real discriminators.
 */
export const queryKeys = {
  // --- Searches -------------------------------------------------------
  searches: () => ["searches"] as const,
  searchesPortfolio: () => ["searches", "portfolio"] as const,
  search: (id: string) => ["searches", id] as const,
  schedules: () => ["schedules"] as const,

  // --- Household ------------------------------------------------------
  household: () => ["household"] as const,

  // --- Review ---------------------------------------------------------
  /** Broad prefix — invalidate to sweep every scoped review query. */
  review: () => ["review"] as const,
  reviewNext: (clusterId?: string | null) =>
    ["review", "next", clusterId ?? null] as const,
  reviewQueue: () => ["review", "queue"] as const,
  reviewTodayStats: () => ["review", "today-stats"] as const,

  // --- Matches --------------------------------------------------------
  matchesUnread: () => ["matches", "unread"] as const,

  // --- Shortlist ------------------------------------------------------
  /** Broad prefix — invalidate to sweep pipeline + mine + per-member. */
  shortlist: () => ["shortlist"] as const,
  shortlistMine: () => ["shortlist", "mine"] as const,
  shortlistMember: (userId: string) => ["shortlist", "member", userId] as const,
  shortlistPipeline: () => ["shortlist", "pipeline"] as const,

  // --- Deferrals ------------------------------------------------------
  /** Broad prefix — invalidate to sweep the list + any count reads. */
  deferrals: () => ["deferrals"] as const,
  deferralsList: () => ["deferrals", "list"] as const,

  // --- Clusters / maintenance ----------------------------------------
  duplicates: () => ["clusters", "duplicates"] as const,

  // --- Misc -----------------------------------------------------------
  mapsKey: () => ["maps-key"] as const,
  listingDetail: (clusterId: string) => ["listings", clusterId] as const,
} as const;
