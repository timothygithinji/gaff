/**
 * `/invite/$token` — single-use household invite acceptance. The user
 * must already be signed in (Cloudflare Access enforces this at the
 * network edge); the server function turns the token into a
 * `household_members` row and burns the verification row.
 */
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { requireSession } from "../../lib/auth-guard";
import { queryKeys } from "../../lib/query-keys";
import { acceptInvite } from "../../server/functions/household";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite · Gaff" }] }),
  beforeLoad: ({ context, params }) => {
    // Send unauth users to /login with the invite URL preserved so they
    // land back here once signed in.
    requireSession(
      context as { currentUserId: string | null },
      `/invite/${params.token}`
    );
  },
  component: InvitePage,
});

function inviteErrorMessage(code: string): string {
  switch (code) {
    case "expired_token":
      return "This invite link has expired.";
    case "owner_of_shared_household":
      // The accepter owns a household someone else has already joined.
      // We refuse rather than cascade-delete that shared household.
      return "You already own a household with other members. Remove them (or have them leave) before joining another.";
    default:
      return "Could not accept this invite.";
  }
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();

  const accept = useMutation({
    mutationFn: () => acceptInvite({ data: { token } }),
    // The page already renders "Joining household…" so the user has
    // visible feedback that something is happening. We deliberately do
    // NOT wipe the household cache here — the previous Review's empty-
    // state-flash lesson applies. Cancel any in-flight read so it
    // doesn't race with the join, then let `onSettled` invalidate to
    // pull the freshly-joined membership in one go.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.household() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.household(),
      });
      navigate({ to: "/" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.household() });
    },
  });

  // Auto-fire on mount — no extra button to press. `mutate` is stable
  // across renders so listing it as a dep is correct for biome's
  // lint pass without introducing a re-fire loop.
  const mutate = accept.mutate;
  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-lg bg-card p-6 text-center shadow">
        <h1 className="font-serif text-foreground text-xl">
          Joining household…
        </h1>
        {accept.isError && (
          <p className="mt-3 text-primary text-sm">
            {inviteErrorMessage((accept.error as Error).message)}
          </p>
        )}
      </div>
    </main>
  );
}
