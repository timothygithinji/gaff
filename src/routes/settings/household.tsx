/**
 * `/settings/household` — the only place where household membership is
 * editable in v1. Owners can invite (mints a copy-link token) and
 * remove members. Everyone can see who's in the household and which
 * member they are.
 *
 * Invite delivery is copy-link only for v1 — paste into WhatsApp /
 * Signal yourself. Email-via-Resend is deferred to v1.1.
 */
import * as Dialog from "@radix-ui/react-dialog";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  householdQueryOptions,
  useHousehold,
} from "../../lib/household-context";
import { createInvite, removeMember } from "../../server/functions/household";

export const Route = createFileRoute("/settings/household")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(householdQueryOptions),
  component: HouseholdSettingsPage,
});

function HouseholdSettingsPage() {
  const { isOwner, members, currentUserId } = useHousehold();
  useSuspenseQuery(householdQueryOptions); // keep the cache alive

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 font-serif text-2xl text-ink">Household</h1>

      <section className="mb-6">
        <h2 className="mb-3 font-medium text-ink text-sm uppercase tracking-wide">
          Members
        </h2>
        <ul className="divide-y divide-brass/10 rounded-lg border border-brass/20 bg-paper">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-ink text-sm">
                  {member.name || member.email}
                </p>
                <p className="text-brass text-xs">
                  {member.email} · {member.role}
                </p>
              </div>
              {isOwner && member.userId !== currentUserId && (
                <RemoveMemberButton memberId={member.id} name={member.name} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && <InviteSection />}
    </main>
  );
}

function InviteSection() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createInvite({ data: {} }),
    onSuccess: (res) => setLink(res.url),
  });

  return (
    <section>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setLink(null);
          }
        }}
      >
        <Dialog.Trigger asChild>
          <button
            className="rounded-md bg-copper px-4 py-2 font-medium text-bone text-sm"
            type="button"
          >
            Invite someone
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md rounded-lg bg-paper p-6 shadow-xl">
            <Dialog.Title className="font-serif text-ink text-lg">
              Invite to household
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-brass text-sm">
              Mint a single-use link, then paste it into WhatsApp / Signal.
              Expires in 7 days.
            </Dialog.Description>

            {link ? (
              <div className="mt-4 space-y-3">
                <input
                  className="w-full rounded border border-brass/30 bg-ground px-3 py-2 text-ink text-sm"
                  readOnly
                  value={link}
                />
                <button
                  className="rounded-md bg-copper px-4 py-2 text-bone text-sm"
                  onClick={() => navigator.clipboard.writeText(link)}
                  type="button"
                >
                  Copy link
                </button>
              </div>
            ) : (
              <div className="mt-4 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    className="rounded-md px-4 py-2 text-ink text-sm"
                    type="button"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  className="rounded-md bg-copper px-4 py-2 text-bone text-sm"
                  disabled={create.isPending}
                  onClick={() => create.mutate()}
                  type="button"
                >
                  {create.isPending ? "Minting…" : "Create link"}
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function RemoveMemberButton({
  memberId,
  name,
}: {
  memberId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeMember({ data: { memberId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: householdQueryOptions.queryKey });
      setOpen(false);
    },
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="rounded border border-brass/30 px-3 py-1 text-brass text-xs"
          type="button"
        >
          Remove
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[90vw] max-w-md rounded-lg bg-paper p-6 shadow-xl">
          <Dialog.Title className="font-serif text-ink text-lg">
            Remove {name || "member"}?
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-brass text-sm">
            Their swipe history stays; they just won't appear in mutual matches
            any more.
          </Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                className="rounded-md px-4 py-2 text-ink text-sm"
                type="button"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              className="rounded-md bg-copper px-4 py-2 text-bone text-sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              type="button"
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
