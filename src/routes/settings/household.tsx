/**
 * `/settings/household` — the only place where household membership is
 * editable in v1. Owners can invite (mints a copy-link token) and
 * remove members. Everyone can see who's in the household and which
 * member they are.
 *
 * Invite delivery is copy-link only for v1 — paste into WhatsApp /
 * Signal yourself. Email-via-Resend is deferred to v1.1.
 *
 * Layout (Paper "Household" artboards, all 4 breakpoints):
 *   - mobile (3QA-0): back-nav + eyebrow + 26px title, then a stack of
 *     individual rounded white cards (one per member), a full-width
 *     navy "Invite someone" pill pinned below.
 *   - tablet (51Y-0): same content, no top-nav shell; back-nav header,
 *     header row with a compact "Invite" button, one grouped card.
 *   - laptop/desktop (51Z-0 / 3RX-0): top-nav shell (AdminSidebar) + a
 *     left "Settings" sub-nav + content (eyebrow, 36px title,
 *     description, "Invite someone" button) and one grouped card with
 *     divider rows.
 *
 * Paper also shows a relative "joined N weeks ago" line and an
 * outstanding-invite row. Neither has a data source (no `joinedAt`
 * column; `createInvite` mints a link but there's no list-invites
 * endpoint), so those are intentionally omitted rather than faked — see
 * the builder report. The Profile / Notifications / Billing / Data &
 * export sub-nav items in Paper are placeholders for routes that don't
 * exist yet; they render as inert muted labels.
 */
import {
  Add01Icon,
  ArrowLeft01Icon,
  Copy01Icon,
  Mail01Icon,
  PencilEdit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { BottomNav } from "../../components/layout/bottom-nav";
import { SettingsNav } from "../../components/settings/settings-nav";
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
import {
  SkeletonPageHeader,
  skeletonIds,
} from "../../components/ui/patterns/skeletons";
import { Skeleton } from "../../components/ui/skeleton";
import { requireSession } from "../../lib/auth-guard";
import {
  householdQueryOptions,
  useHousehold,
} from "../../lib/household-context";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import {
  type HouseholdMemberRow,
  type HouseholdPayload,
  createInvite,
  removeMember,
  renameHousehold,
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
  pendingComponent: PendingHousehold,
  component: HouseholdSettingsPage,
});

/** Loading frame — header + member-row skeletons in the settings shell
 * (desktop) and the mobile column. */
function PendingHousehold() {
  const rows = skeletonIds("member", 2);
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex w-full gap-10 px-10 py-10">
          <SettingsNav />
          <div className="flex min-w-0 max-w-[640px] grow flex-col gap-6">
            <SkeletonPageHeader />
            <div className="flex flex-col gap-3">
              {rows.map((id) => (
                <MemberRowSkeleton key={id} />
              ))}
            </div>
          </div>
        </div>
      </AdminSidebar>
      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-5 pt-5 sm:px-8 sm:pt-8">
          <SkeletonPageHeader />
          <div className="flex flex-col gap-3">
            {rows.map((id) => (
              <MemberRowSkeleton key={id} />
            ))}
          </div>
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function MemberRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-card p-3.5">
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Fixed-navy + copper surfaces pin literal hex so they don't flip in
 * the dark scene (per globals.css dark-mode gotcha). */
const NAVY = "#0e2235";
const NAVY_TEXT = "#eef1f4";
const COPPER = "#d77a4a";

const AVATAR_FILLS = [NAVY, COPPER] as const;

function memberInitial(member: HouseholdMemberRow): string {
  return (member.name || member.email || "?").charAt(0).toUpperCase();
}

/** Owner gets the navy avatar, everyone else copper — matches Paper's
 * two-tone member list. Keyed off role so it's stable across renders. */
function avatarFill(role: HouseholdMemberRow["role"]): string {
  return role === "owner" ? AVATAR_FILLS[0] : AVATAR_FILLS[1];
}

function HouseholdSettingsPage() {
  const { household, isOwner, members, currentUserId } = useHousehold();
  useSuspenseQuery(householdQueryOptions); // keep the cache alive

  const memberCountLabel = `${members.length} ${
    members.length === 1 ? "member" : "members"
  }`;

  return (
    <>
      <AdminSidebar mode="desktop-only">
        <DesktopHousehold
          currentUserId={currentUserId}
          householdName={household.name}
          isOwner={isOwner}
          memberCountLabel={memberCountLabel}
          members={members}
        />
      </AdminSidebar>

      {/* Mobile + tablet (single column, no top-nav shell). */}
      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto w-full max-w-[640px]">
          <header className="flex flex-col gap-5 px-5 pt-5 sm:px-8 sm:pt-8">
            <Link
              className="flex items-center gap-3.5 text-slate text-sm transition-colors hover:text-navy"
              to="/"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={16}
                strokeWidth={1.5}
              />
              Settings
            </Link>
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
                  {memberCountLabel}
                </p>
                <h1 className="font-semibold text-[26px] text-navy leading-[100%] tracking-[-0.02em]">
                  Household
                </h1>
              </div>
              {isOwner ? (
                <div className="hidden shrink-0 sm:block">
                  <InviteDialog compact />
                </div>
              ) : null}
            </div>
          </header>

          <main className="flex flex-col gap-2.5 px-5 pt-5 sm:px-8">
            <HouseholdNameCard isOwner={isOwner} name={household.name} />
            {members.map((member) => (
              <MemberCard
                currentUserId={currentUserId}
                isOwner={isOwner}
                key={member.id}
                member={member}
              />
            ))}
            {isOwner ? (
              <div className="mt-1.5 sm:hidden">
                <InviteDialog fullWidth />
              </div>
            ) : null}
          </main>
        </div>
        <BottomNav />
      </div>
    </>
  );
}

/**
 * Mobile member row rendered as its own rounded card (Paper stacks
 * separate cards on mobile rather than one grouped list).
 */
function MemberCard({
  member,
  isOwner,
  currentUserId,
}: {
  member: HouseholdMemberRow;
  isOwner: boolean;
  currentUserId: string;
}) {
  const isSelf = member.userId === currentUserId;
  const canRemove = isOwner && !isSelf && member.role !== "owner";

  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-line bg-card px-[18px] py-4">
      <Initial fill={avatarFill(member.role)} text={memberInitial(member)} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-[15px] text-navy">
            {member.name || member.email}
          </p>
          <RolePill isSelf={isSelf} role={member.role} />
        </div>
        <p className="truncate text-slate text-xs">{member.email}</p>
      </div>
      {canRemove ? (
        <RemoveMemberButton memberId={member.id} name={member.name} />
      ) : null}
    </div>
  );
}

/** Round avatar tile with a centred initial — plain div (no Avatar
 * primitive) so the fixed navy/copper fill survives the dark scene. */
function Initial({
  fill,
  text,
  className,
}: {
  fill: string;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        className
      )}
      style={{ backgroundColor: fill }}
    >
      <span className="font-semibold text-[17px]" style={{ color: NAVY_TEXT }}>
        {text}
      </span>
    </div>
  );
}

function RolePill({
  role,
  isSelf,
}: {
  role: HouseholdMemberRow["role"];
  isSelf: boolean;
}) {
  const label =
    role === "owner" ? (isSelf ? "OWNER · YOU" : "OWNER") : "MEMBER";
  return (
    <span className="shrink-0 rounded-full bg-mist px-2 py-0.5 font-semibold text-[10px] text-slate tracking-[0.08em]">
      {label}
    </span>
  );
}

/**
 * Editable household name. Owners get an inline edit affordance; everyone
 * else sees the name read-only. Save is optimistic — the cached household
 * payload's name is swapped immediately so the field (and any other
 * consumer of `useHousehold`) repaints before the round-trip lands, then
 * rolled back on error. Mirrors the RemoveMemberButton mutation shape.
 */
function HouseholdNameCard({
  name,
  isOwner,
}: {
  name: string;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (next: string) => renameHousehold({ data: { name: next } }),
    onMutate: async (next: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.household() });
      const prev = qc.getQueryData<HouseholdPayload>(queryKeys.household());
      if (prev) {
        qc.setQueryData<HouseholdPayload>(queryKeys.household(), {
          ...prev,
          household: { ...prev.household, name: next },
        });
      }
      return { prev };
    },
    onSuccess: () => {
      setError(null);
      setEditing(false);
    },
    onError: (e: Error, _next, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.household(), ctx.prev);
      }
      setError(e.message ?? "Couldn't rename household");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.household() });
    },
  });

  function startEditing() {
    setValue(name);
    setError(null);
    setEditing(true);
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Give your household a name");
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    rename.mutate(trimmed);
  }

  if (!(isOwner && editing)) {
    return (
      <div className="flex items-center gap-3.5 rounded-lg border border-line bg-card px-[18px] py-4">
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.12em]">
            Household name
          </p>
          <p className="truncate font-semibold text-[15px] text-navy">{name}</p>
        </div>
        {isOwner ? (
          <button
            className="flex shrink-0 items-center gap-1.5 font-medium text-copper text-xs transition-opacity hover:opacity-70"
            onClick={startEditing}
            type="button"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.5} />
            Edit
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5 rounded-lg border border-line bg-card px-[18px] py-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-semibold text-[10px] text-slate uppercase tracking-[0.12em]">
          Household name
        </span>
        <input
          className={cn(
            "w-full rounded-md border bg-card px-3.5 py-2.5 text-[15px] text-navy outline-none transition-colors focus:border-primary",
            error ? "border-warning" : "border-[#c9d3dc]"
          )}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          value={value}
        />
      </label>
      {error ? <p className="text-warning-text text-xs">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          loading={rename.isPending}
          loadingText="Saving…"
          size="sm"
          type="submit"
        >
          Save
        </Button>
      </div>
    </form>
  );
}

function DesktopHousehold({
  isOwner,
  members,
  currentUserId,
  memberCountLabel,
  householdName,
}: {
  isOwner: boolean;
  members: HouseholdPayload["members"];
  currentUserId: string;
  memberCountLabel: string;
  householdName: string;
}) {
  return (
    <div className="flex w-full gap-10 px-10 py-10">
      <SettingsNav />
      <div className="flex min-w-0 grow flex-col gap-6">
        <header className="flex items-end justify-between gap-8">
          <div className="flex min-w-0 grow flex-col gap-1">
            <p className="font-semibold text-[11px] text-slate uppercase tracking-[0.14em]">
              {memberCountLabel}
            </p>
            <h1 className="font-semibold text-4xl text-navy leading-[1.1] tracking-[-0.025em]">
              Household
            </h1>
            <p className="max-w-[560px] pt-1 text-slate text-sm">
              Anyone in here sees the same searches and shortlist. The blind
              veto loop runs between everyone.
            </p>
          </div>
          {isOwner ? (
            <div className="shrink-0">
              <InviteDialog />
            </div>
          ) : null}
        </header>

        <HouseholdNameCard isOwner={isOwner} name={householdName} />

        <ul className="flex flex-col overflow-hidden rounded-lg border border-line bg-card">
          {members.map((member, idx) => {
            const isSelf = member.userId === currentUserId;
            const canRemove =
              isOwner && !isSelf && member.role !== "owner";
            return (
              <li
                className={cn(
                  "flex items-center gap-4 px-[22px] py-[18px]",
                  idx < members.length - 1 && "border-mist border-b"
                )}
                key={member.id}
              >
                <Initial
                  fill={avatarFill(member.role)}
                  text={memberInitial(member)}
                />
                <div className="flex min-w-0 grow flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-[15px] text-navy">
                      {member.name || member.email}
                    </p>
                    <RolePill isSelf={isSelf} role={member.role} />
                  </div>
                  <p className="truncate text-slate text-xs">{member.email}</p>
                </div>
                {canRemove ? (
                  <RemoveMemberButton memberId={member.id} name={member.name} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * "Invite someone" — mints a single-use copy-link token (7-day expiry)
 * then surfaces it for copying. `compact` shortens the label to "Invite"
 * (tablet header); `fullWidth` renders the navy pill that spans the
 * mobile column.
 */
function InviteDialog({
  compact = false,
  fullWidth = false,
}: {
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => createInvite({ data: {} }),
    onSuccess: (res) => setLink(res.url),
  });

  function reset() {
    setLink(null);
    setCopied(false);
  }

  async function copy() {
    if (!link) {
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
        }
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className={cn(
              "h-auto gap-2 rounded-md px-5 py-3 font-medium text-[13px]",
              fullWidth && "w-full rounded-full py-4"
            )}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
            {compact ? "Invite" : "Invite someone"}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle className='text-lg text-navy'>
          Invite to household
        </DialogTitle>
        <DialogDescription>
          Mint a single-use link, then paste it into WhatsApp / Signal. Expires
          in 7 days.
        </DialogDescription>

        {link ? (
          <div className="mt-1 space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-ground px-3 py-2.5">
              <HugeiconsIcon
                className="shrink-0 text-slate"
                icon={Mail01Icon}
                size={16}
                strokeWidth={1.5}
              />
              <input
                className="min-w-0 grow bg-transparent text-navy text-sm outline-none"
                readOnly
                value={link}
              />
            </div>
            <Button className="w-full gap-2" onClick={copy} type="button">
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                size={16}
                strokeWidth={1.5}
              />
              {copied ? "Copied" : "Copy link"}
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <button
            className="shrink-0 font-medium text-copper text-xs transition-opacity hover:opacity-70"
            type="button"
          >
            Remove
          </button>
        }
      />
      <DialogContent>
        <DialogTitle className='text-lg text-navy'>
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
