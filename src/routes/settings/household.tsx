/**
 * `/settings/household` — the only place where household membership is
 * editable in v1. Owners can invite (mints a copy-link token) and
 * remove members. Everyone can see who's in the household and which
 * member they are.
 *
 * Invite delivery is copy-link only for v1 — paste into WhatsApp /
 * Signal yourself. Email-via-Resend is deferred to v1.1.
 */
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BottomNav } from "../../components/layout/bottom-nav";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { requireSession } from "../../lib/auth-guard";
import {
  householdQueryOptions,
  useHousehold,
} from "../../lib/household-context";
import { queryKeys } from "../../lib/query-keys";
import {
  type HouseholdPayload,
  createInvite,
  removeMember,
} from "../../server/functions/household";

export const Route = createFileRoute("/settings/household")({
  head: () => ({ meta: [{ title: "Household settings · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/settings/household"
    );
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(householdQueryOptions),
  component: HouseholdSettingsPage,
});

function HouseholdSettingsPage() {
  const { isOwner, members, currentUserId } = useHousehold();
  useSuspenseQuery(householdQueryOptions); // keep the cache alive

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-28">
      <header className="flex flex-col gap-1 px-6 pt-6 pb-5">
        <h1 className="font-medium font-serif text-[32px] text-foreground leading-[110%] tracking-[-0.03em]">
          Household
        </h1>
      </header>

      <main className="space-y-6 px-4">
        <section>
          <p className="mb-2 px-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Members
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-foreground text-sm">
                    {member.name || member.email}
                  </p>
                  <p className="text-muted-foreground text-xs">
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
      <BottomNav />
    </div>
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
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setLink(null);
          }
        }}
      >
        <DialogTrigger render={<Button>Invite someone</Button>} />
        <DialogContent>
          <DialogTitle className="font-serif text-foreground text-lg">
            Invite to household
          </DialogTitle>
          <DialogDescription>
            Mint a single-use link, then paste it into WhatsApp / Signal.
            Expires in 7 days.
          </DialogDescription>

          {link ? (
            <div className="mt-2 space-y-3">
              <input
                className="w-full rounded border border-border bg-background px-3 py-2 text-foreground text-sm"
                readOnly
                value={link}
              />
              <Button
                onClick={() => navigator.clipboard.writeText(link)}
                type="button"
              >
                Copy link
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Cancel</Button>} />
              <Button
                loading={create.isPending}
                loadingText="Minting…"
                onClick={() => create.mutate()}
                type="button"
              >
                Create link
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
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
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => removeMember({ data: { memberId } }),
    // Optimistic: drop the member from the cached household payload so
    // the list re-paints immediately. The server still authorises
    // ownership and burns the row — on error we roll back and show a
    // banner above the dialog footer.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.household() });
      const prev = qc.getQueryData<HouseholdPayload>(queryKeys.household());
      if (prev) {
        qc.setQueryData<HouseholdPayload>(queryKeys.household(), {
          ...prev,
          members: prev.members.filter((m) => m.id !== memberId),
        });
      }
      return { prev };
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.household(), ctx.prev);
      }
      setError(e.message ?? "Couldn't remove member");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.household() });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Remove
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle className="font-serif text-foreground text-lg">
          Remove {name || "member"}?
        </DialogTitle>
        <DialogDescription>
          Their swipe history stays; they just won't appear in mutual matches
          any more.
        </DialogDescription>
        {error ? (
          <p className="mt-2 text-destructive text-sm">{error}</p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            loading={remove.isPending}
            loadingText="Removing…"
            onClick={() => remove.mutate()}
            type="button"
            variant="destructive"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
