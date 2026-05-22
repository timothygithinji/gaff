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
import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { Household } from "../../db/schema";
import {
  type HouseholdMemberRow,
  getHousehold,
} from "../server/functions/household";

export interface HouseholdValue {
  household: Household;
  members: HouseholdMemberRow[];
  memberCount: number;
  currentUserId: string;
  isOwner: boolean;
  otherMembers: HouseholdMemberRow[];
}

const HouseholdContext = createContext<HouseholdValue | null>(null);

export const householdQueryOptions = {
  queryKey: ["household"] as const,
  queryFn: () => getHousehold(),
  // We refetch on focus because the membership list can change without
  // a router navigation (e.g. an owner invites you and you accept in
  // another tab). Bigger staleTime keeps idle requests off the wire.
  staleTime: 30_000,
};

export function HouseholdProvider({
  currentUserId,
  children,
}: {
  /**
   * The signed-in user's id (read on the server in `__root.tsx`'s
   * loader). We accept it as a prop rather than refetching the session
   * here so the provider can compute `isOwner` / `otherMembers` on
   * first paint instead of after a second request.
   */
  currentUserId: string | null;
  children: ReactNode;
}) {
  const { data, isLoading, isError } = useQuery(householdQueryOptions);

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

  // No session yet — render children unwrapped (e.g. /invite/$token
  // accepts before there's a household membership; /login pre-auth).
  if (!currentUserId) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <HouseholdSkeleton />;
  }
  if (isError || !value) {
    return <>{children}</>;
  }

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

function HouseholdSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground text-ink">
      <div className="h-6 w-24 animate-pulse rounded bg-bone" />
    </div>
  );
}

/**
 * Hook for consuming the household. Throws when used outside a
 * provider OR when the provider has no value yet — call sites that
 * might render pre-auth should guard with `useHouseholdOptional`.
 */
export function useHousehold(): HouseholdValue {
  const value = useContext(HouseholdContext);
  if (!value) {
    throw new Error(
      "useHousehold() called outside <HouseholdProvider>. " +
        "Wrap your tree in <HouseholdProvider currentUserId={...}>."
    );
  }
  return value;
}

export function useHouseholdOptional(): HouseholdValue | null {
  return useContext(HouseholdContext);
}
