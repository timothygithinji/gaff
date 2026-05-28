/**
 * Shared helpers for the `?from=` search param that the listing-detail
 * route uses to remember where the user came from. Drives the
 * breadcrumb label, the back-button target, and which sidebar item the
 * shell highlights while a listing is open.
 */
import { z } from "zod";

export const listingFromOriginSchema = z
  .enum(["review", "shortlist", "matches", "compare"])
  .optional();

export type ListingFromOrigin = z.infer<typeof listingFromOriginSchema>;

type OriginMeta = {
  /** Path the back button + breadcrumb anchor should target. */
  path: "/" | "/shortlist" | "/matches" | "/compare";
  /** Label rendered in the breadcrumb. */
  label: string;
  /** Sidebar nav `to` to mark active when on /listings/*. */
  sidebarTo: "/" | "/shortlist";
};

const ORIGIN_TABLE: Record<NonNullable<ListingFromOrigin>, OriginMeta> = {
  review: { path: "/", label: "Review", sidebarTo: "/" },
  shortlist: {
    path: "/shortlist",
    label: "Shortlist",
    sidebarTo: "/shortlist",
  },
  // Matches lives under Shortlist in the IA, so the sidebar still
  // highlights Shortlist even though the breadcrumb says Matches.
  matches: { path: "/matches", label: "Matches", sidebarTo: "/shortlist" },
  // `/compare` is reached from Shortlist (the only place you'd select
  // two listings to compare), so the back button + sidebar both
  // resolve to Shortlist on the listing-detail page when `from=compare`.
  compare: { path: "/compare", label: "Compare", sidebarTo: "/shortlist" },
};

const DEFAULT_ORIGIN: OriginMeta = ORIGIN_TABLE.review;

export function resolveFromOrigin(from: ListingFromOrigin): OriginMeta {
  if (!from) {
    return DEFAULT_ORIGIN;
  }
  return ORIGIN_TABLE[from];
}
