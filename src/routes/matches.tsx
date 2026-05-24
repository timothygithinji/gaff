/**
 * `/matches` — legacy route. The dedicated Matches view has been
 * retired; mutual matches now live as the "Shortlisted" column of the
 * pipeline on `/shortlist`.
 *
 * Kept as a thin redirect so old bookmarks and notification deep-links
 * don't 404. The unread-badge clearing has moved to `/shortlist`'s
 * mount effect.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/matches")({
  beforeLoad: () => {
    throw redirect({ to: "/shortlist" });
  },
  component: () => null,
});
