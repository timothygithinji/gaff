/**
 * `/invite/$token` — single-use household invite acceptance. The user
 * must already be signed in (Cloudflare Access enforces this at the
 * network edge); the server function turns the token into a
 * `household_members` row and burns the verification row.
 */
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { householdQueryOptions } from "../../lib/household-context";
import { acceptInvite } from "../../server/functions/household";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();

  const accept = useMutation({
    mutationFn: () => acceptInvite({ data: { token } }),
    onSuccess: async () => {
      // Drop any cached household payload before navigating so the
      // app immediately picks up the newly-joined household.
      await queryClient.invalidateQueries({
        queryKey: householdQueryOptions.queryKey,
      });
      navigate({ to: "/" });
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
    <main className="flex min-h-screen items-center justify-center bg-ground p-6">
      <div className="w-full max-w-sm rounded-lg bg-paper p-6 text-center shadow">
        <h1 className="font-serif text-ink text-xl">Joining household…</h1>
        {accept.isError && (
          <p className="mt-3 text-copper text-sm">
            {(accept.error as Error).message === "expired_token"
              ? "This invite link has expired."
              : "Could not accept this invite."}
          </p>
        )}
      </div>
    </main>
  );
}
