/**
 * `/settings/account` — personal account settings, distinct from the
 * household-scoped `/settings/household`. Three panels:
 *
 *   - Your name     — edits the Better Auth `user.name` via
 *                      `authClient.updateUser`. This drives the avatar
 *                      initial and how you show in the member list, so a
 *                      save invalidates the household query to repaint it.
 *   - Password      — `authClient.changePassword` (email/password is the
 *                      only credential provider). Asks for the current
 *                      password and confirms the new one client-side.
 *
 * Sign-out lives in the desktop top-nav avatar dropdown, so it's not
 * duplicated here.
 *
 * Layout mirrors `/settings/household`: desktop renders inside the
 * `AdminSidebar` shell beside the shared `SettingsNav`; mobile/tablet is a
 * single centred column with the `BottomNav`.
 */
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { BottomNav } from "../../components/layout/bottom-nav";
import { SettingsNav } from "../../components/settings/settings-nav";
import { TextField } from "../../components/text-field";
import { Button } from "../../components/ui/button";
import {
  SkeletonPageHeader,
  skeletonIds,
} from "../../components/ui/patterns/skeletons";
import { Skeleton } from "../../components/ui/skeleton";
import { authClient } from "../../lib/auth-client";
import { requireSession } from "../../lib/auth-guard";
import {
  householdQueryOptions,
  useHousehold,
} from "../../lib/household-context";
import { queryKeys } from "../../lib/query-keys";

export const Route = createFileRoute("/settings/account")({
  head: () => ({ meta: [{ title: "Account settings · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/settings/account"
    );
  },
  // The name field defaults from the household member row, so make sure
  // the household payload is in cache before the component renders.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(householdQueryOptions),
  pendingComponent: PendingAccount,
  component: AccountSettingsPage,
});

function PendingAccount() {
  const cards = skeletonIds("panel", 3);
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex w-full gap-10 px-10 py-10">
          <SettingsNav />
          <div className="flex min-w-0 max-w-[640px] grow flex-col gap-6">
            <SkeletonPageHeader />
            <div className="flex flex-col gap-4">
              {cards.map((id) => (
                <Skeleton className="h-32 rounded-lg" key={id} />
              ))}
            </div>
          </div>
        </div>
      </AdminSidebar>
      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-5 pt-5 sm:px-8 sm:pt-8">
          <SkeletonPageHeader />
          <div className="flex flex-col gap-4">
            {cards.map((id) => (
              <Skeleton className="h-32 rounded-lg" key={id} />
            ))}
          </div>
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function AccountSettingsPage() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex w-full gap-10 px-10 py-10">
          <SettingsNav />
          <div className="flex min-w-0 max-w-[640px] grow flex-col gap-6">
            <header className="flex flex-col gap-1">
              <p className="font-semibold text-[11px] text-slate uppercase tracking-[0.14em]">
                Your account
              </p>
              <h1 className="font-semibold text-4xl text-navy leading-[1.1] tracking-[-0.025em]">
                Account
              </h1>
              <p className="max-w-[560px] pt-1 text-slate text-sm">
                How you show up in the household, and your sign-in details.
              </p>
            </header>
            <AccountPanels />
          </div>
        </div>
      </AdminSidebar>

      {/* Mobile + tablet (single column, no top-nav shell). */}
      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-5 pt-5 sm:px-8 sm:pt-8">
          <header className="flex flex-col gap-1">
            <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
              Your account
            </p>
            <h1 className="font-semibold text-[26px] text-navy leading-[100%] tracking-[-0.02em]">
              Account
            </h1>
          </header>
          <AccountPanels />
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function AccountPanels() {
  return (
    <div className="flex flex-col gap-4">
      <NamePanel />
      <PasswordPanel />
    </div>
  );
}

/** Card chrome shared by the three panels — title, optional description,
 * then the panel body. */
function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-card px-[22px] py-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-[15px] text-navy">{title}</h2>
        {description ? (
          <p className="text-slate text-xs leading-[18px]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const nameSchema = z.string().trim().min(1, "What should we call you?");

/** Edit the signed-in user's display name. */
function NamePanel() {
  const { members, currentUserId } = useHousehold();
  const me = members.find((m) => m.userId === currentUserId);
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: (name: string) =>
      new Promise<void>((resolve, reject) => {
        authClient.updateUser(
          { name },
          {
            onSuccess: () => resolve(),
            onError: (ctx) => reject(new Error(ctx.error.message)),
          }
        );
      }),
    onSuccess: () => {
      // The member list joins `user.name`, so refresh it to show the
      // new name (and re-key the avatar initial).
      qc.invalidateQueries({ queryKey: queryKeys.household() });
      setSaved(true);
    },
    onError: (e: Error) => setServerError(e.message ?? "Couldn't save"),
  });

  const form = useForm({
    defaultValues: { name: me?.name ?? "" },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setSaved(false);
      await update.mutateAsync(value.name.trim());
    },
  });

  return (
    <SettingsCard
      description="Shown to everyone in your household and on your avatar."
      title="Your name"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => {
              setSaved(false);
              const r = nameSchema.safeParse(value);
              return r.success ? undefined : r.error.issues[0]?.message;
            },
          }}
        >
          {(field) => (
            <TextField
              autoComplete="name"
              field={field}
              label="Name"
              type="text"
            />
          )}
        </form.Field>

        {serverError ? (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-[13px] text-warning-text leading-4">
            {serverError}
          </p>
        ) : null}
        {saved ? (
          <p className="text-[13px] text-success leading-4">Saved.</p>
        ) : null}

        <div className="flex justify-end">
          <Button
            loading={update.isPending}
            loadingText="Saving…"
            type="submit"
          >
            Save name
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

const passwordSchema = z.string().min(8, "At least 8 characters");

/** Change the account password (current → new + confirm). */
function PasswordPanel() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      new Promise<void>((resolve, reject) => {
        authClient.changePassword(
          {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
            // Keep the other partner's session alive — changing your own
            // password shouldn't sign your household-mate out.
            revokeOtherSessions: false,
          },
          {
            onSuccess: () => resolve(),
            onError: (ctx) => reject(new Error(ctx.error.message)),
          }
        );
      }),
    onSuccess: () => setSaved(true),
    onError: (e: Error) =>
      setServerError(e.message ?? "Couldn't change password"),
  });

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      setSaved(false);
      if (value.newPassword !== value.confirmPassword) {
        setServerError("New passwords don't match");
        return;
      }
      await change.mutateAsync({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      form.reset();
    },
  });

  return (
    <SettingsCard
      description="You'll stay signed in on this device after changing it."
      title="Password"
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field name="currentPassword">
          {(field) => (
            <TextField
              autoComplete="current-password"
              field={field}
              label="Current password"
              type="password"
            />
          )}
        </form.Field>

        <form.Field
          name="newPassword"
          validators={{
            onChange: ({ value }) => {
              setSaved(false);
              const r = passwordSchema.safeParse(value);
              return r.success ? undefined : r.error.issues[0]?.message;
            },
          }}
        >
          {(field) => (
            <TextField
              autoComplete="new-password"
              field={field}
              label="New password"
              type="password"
            />
          )}
        </form.Field>

        <form.Field
          name="confirmPassword"
          validators={{
            onChangeListenTo: ["newPassword"],
            onChange: ({ value, fieldApi }) => {
              if (value !== fieldApi.form.getFieldValue("newPassword")) {
                return "Passwords don't match";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <TextField
              autoComplete="new-password"
              field={field}
              label="Confirm new password"
              type="password"
            />
          )}
        </form.Field>

        {serverError ? (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-[13px] text-warning-text leading-4">
            {serverError}
          </p>
        ) : null}
        {saved ? (
          <p className="text-[13px] text-success leading-4">Password changed.</p>
        ) : null}

        <div className="flex justify-end">
          <Button
            loading={change.isPending}
            loadingText="Updating…"
            type="submit"
          >
            Change password
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

