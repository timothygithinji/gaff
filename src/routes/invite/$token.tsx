/**
 * `/invite/$token` — single-use household invite acceptance. The user
 * must already be signed in (Cloudflare Access enforces this at the
 * network edge); the server function turns the token into a
 * `household_members` row and burns the verification row.
 */
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthEyebrow, AuthLayout } from "../../components/auth/auth-layout";
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
      await navigate({ to: "/" });
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

  const isError = accept.isError;

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Stacked household avatars, as drawn in the Paper invite artboard. */}
        <div className="flex items-center">
          <span className="flex size-14 items-center justify-center rounded-full border-2 border-ground bg-[#1f3a5f] font-semibold text-[20px] text-white leading-6">
            P
          </span>
          <span className="-ml-3 flex size-14 items-center justify-center rounded-full border-2 border-ground bg-[#d77a4a] font-semibold text-[20px] text-white leading-6">
            T
          </span>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <AuthEyebrow>You're invited</AuthEyebrow>
          <h1 className="font-semibold text-[26px] text-foreground leading-8 tracking-[-0.02em] lg:text-[28px] lg:leading-[34px]">
            You've been invited to
            <br />
            a household
          </h1>
          <p className="max-w-[300px] text-[#5a7596] text-sm leading-[22px]">
            Join to share a single queue, swipe together, and only see flats you
            both like.
          </p>
        </div>

        <div className="flex w-full items-center justify-center rounded-full bg-primary px-4 py-4 font-medium text-[14px] text-white leading-[18px]">
          {isError ? "Couldn't join" : "Joining household…"}
        </div>

        {isError ? (
          <p className="max-w-[300px] text-[13px] text-warning leading-[18px]">
            {inviteErrorMessage((accept.error as Error).message)}
          </p>
        ) : (
          <p className="max-w-[280px] text-[#5a7596] text-[12px] leading-4">
            Hang tight — we're adding you to the shared queue.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
