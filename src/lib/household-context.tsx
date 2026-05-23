/**
 * Household context — the single source of truth for "which household
 * is the current user in, and who else is in it?". Every screen that
 * needs to branch on `member_count` (bottom nav Matches tab, shortlist
 * tabs, CTA copy) consumes this rather than re-fetching.
 *
 * The provider runs a TanStack Query against `getHousehold` (server
 * function). The auto-create database hook in `createAuth` guarantees
 * every signed-in user has a household by the time this query runs, so
 * the "no household" branch is a defensive fallback rather than a
 * common path.
 */
import { useQuery } from "@tanstack/react-query";
import {
  type Context,
  type ReactNode,
  createContext,
  useContext,
  useMemo,
} from "react";
import type { Household } from "../../db/schema";
import {
  type HouseholdMemberRow,
  getHousehold,
} from "../server/functions/household";
import { useSession } from "./auth-client";
import { queryKeys } from "./query-keys";

export interface HouseholdValue {
  household: Household;
  members: HouseholdMemberRow[];
  memberCount: number;
  currentUserId: string;
  isOwner: boolean;
  otherMembers: HouseholdMemberRow[];
}

/**
 * Pin the context object to `globalThis` so HMR module reloads don't
 * mint a fresh `createContext()` reference. Without this, when this
 * module's *consumer* (e.g. a listing-detail component) Fast-Refreshes,
 * the consumer picks up a new Context instance while the higher-up
 * Provider still writes to the old one — and `useContext` returns the
 * default `null`, triggering "useHousehold() called with no household".
 * Production never hits this path (no HMR), but the dev DX is bad
 * enough to warrant the global. Typed as a record to avoid `any`.
 */
const CONTEXT_KEY = "__gaff_household_context";
type GlobalWithContext = typeof globalThis & {
  [CONTEXT_KEY]?: Context<HouseholdValue | null>;
};
const HouseholdContext: Context<HouseholdValue | null> =
  (globalThis as GlobalWithContext)[CONTEXT_KEY] ??
  ((globalThis as GlobalWithContext)[CONTEXT_KEY] =
    createContext<HouseholdValue | null>(null));

export const householdQueryOptions = {
  queryKey: queryKeys.household(),
  queryFn: () => getHousehold(),
  // We refetch on focus because the membership list can change without
  // a router navigation (e.g. an owner invites you and you accept in
  // another tab). Bigger staleTime keeps idle requests off the wire.
  staleTime: 30_000,
};

export function HouseholdProvider({
  initialUserId,
  children,
}: {
  /**
   * SSR hydration hint — the signed-in user's id as known by the root
   * loader (`__root.tsx`'s `beforeLoad`). Used only for the first paint
   * so the provider can compute `isOwner` / `otherMembers` without a
   * second round-trip. After hydration, `useSession()` is the source of
   * truth: it survives HMR remounts that drop the TanStack Router
   * route context, so we don't briefly collapse to "no user" and throw
   * `useHousehold() called outside <HouseholdProvider>` in dev.
   */
  initialUserId: string | null;
  children: ReactNode;
}) {
  const session = useSession();
  // While the session hook is still doing its initial fetch, fall back
  // to `initialUserId` so a user with a valid cookie doesn't flicker
  // through a signed-out state on first paint. Once the hook settles
  // we trust it absolutely — including a `null` result (signed out
  // after the SSR snapshot was taken).
  const currentUserId = session.isPending
    ? initialUserId
    : (session.data?.user?.id ?? null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    ...householdQueryOptions,
    enabled: Boolean(currentUserId),
  });

  const value = useMemo<HouseholdValue | null>(() => {
    if (!(data && currentUserId)) {
      return null;
    }
    return {
      household: data.household,
      members: data.members,
      memberCount: data.members.length,
      currentUserId,
      isOwner:
        data.members.find((m) => m.userId === currentUserId)?.role === "owner",
      otherMembers: data.members.filter((m) => m.userId !== currentUserId),
    };
  }, [data, currentUserId]);

  // Pre-auth surfaces (/login, /signup, /invite/$token) still need to
  // render their children. We supply a null-valued context rather than
  // bypassing the provider so `useHouseholdOptional()` works and the
  // tree always has a context above it — no fragile branch where an
  // accidental `useHousehold()` call collapses to "called outside
  // <HouseholdProvider>" because the HMR-transient currentUserId was
  // briefly missing.
  if (!currentUserId) {
    return (
      <HouseholdContext.Provider value={null}>
        {children}
      </HouseholdContext.Provider>
    );
  }

  if (isLoading) {
    return <HouseholdSkeleton />;
  }
  // Signed in but the household query failed or returned no data.
  // Render an explicit error UI rather than children — calling
  // useHousehold() downstream would throw and crash the route. The
  // retry button hits the same query so transient network errors clear
  // on click.
  if (isError || !value) {
    return (
      <HouseholdErrorState
        message={error instanceof Error ? error.message : null}
        onRetry={() => {
          refetch();
        }}
      />
    );
  }

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

function HouseholdSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="h-6 w-24 animate-pulse rounded bg-muted" />
    </div>
  );
}

function HouseholdErrorState({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex max-w-sm flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6">
        <p className="font-semibold text-[10px] text-primary uppercase tracking-[0.14em]">
          Couldn't load your household
        </p>
        <h1 className="font-serif text-2xl">Something went sideways</h1>
        <p className="text-muted-foreground text-sm">
          {message ?? "We couldn't reach the household service. Try again."}
        </p>
        <button
          className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * Hook for consuming the household. Throws when the provider has no
 * value — i.e. the caller rendered on a pre-auth route (`/login`,
 * `/signup`, `/invite/$token`) or before the session settled. Pre-auth
 * call sites should use `useHouseholdOptional`.
 */
export function useHousehold(): HouseholdValue {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error(
      "useHousehold() called with no household available. " +
        "Either the user is signed out (use useHouseholdOptional on pre-auth routes) " +
        "or the route isn't auth-gated via requireSession()."
    );
  }
  return value;
}

export function useHouseholdOptional(): HouseholdValue | null {
  return useContext(HouseholdContext);
}
