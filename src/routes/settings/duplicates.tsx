/**
 * `/settings/duplicates` — manual cross-portal de-duplication tool.
 *
 * Cross-portal clustering matches on exact normalised-address equality, so
 * the same flat listed on two portals can sit in two clusters and show up
 * twice in the review queue. This page surfaces likely duplicate groups —
 * shared street + outcode + bedrooms AND strong evidence (near-identical
 * rent OR coordinates within ~30m), cross-portal only — and shows the
 * distance + rent delta so you decide. Merging re-points listings + swipes
 * + shortlist state; swipe conflicts resolve skip-wins. Street name alone
 * is never enough (two homes on a road are different homes). See
 * `src/server/functions/clusters.ts`.
 */
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
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
import {
  DuplicateCompare,
  type MergeRole,
} from "../../components/settings/duplicate-compare";
import { SettingsNav } from "../../components/settings/settings-nav";
import { Button } from "../../components/ui/button";
import { SkeletonList } from "../../components/ui/patterns/skeletons";
import { requireSession } from "../../lib/auth-guard";
import { duplicatesQueryOptions } from "../../lib/duplicates-query";
import { queryKeys } from "../../lib/query-keys";
import {
  type DuplicateGroup,
  dismissDuplicateSuggestion,
  mergeClusters,
} from "../../server/functions/clusters";

export const Route = createFileRoute("/settings/duplicates")({
  head: () => ({ meta: [{ title: "Merge duplicates · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/settings/duplicates"
    );
  },
  // Prefetch in the loader (parity with /deferred) so the list is
  // SSR-painted instead of popping in via a mount-time fetch.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(duplicatesQueryOptions),
  pendingComponent: PendingDuplicates,
  component: DuplicatesPage,
});

function DuplicatesPage() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex w-full gap-10 px-10 py-10">
          <SettingsNav />
          <div className="flex min-w-0 grow flex-col">
            <Header />
            <DuplicatesList />
          </div>
        </div>
      </AdminSidebar>

      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto w-full max-w-[640px] px-5 pt-5 sm:px-8 sm:pt-8">
          <Link
            className="mb-5 flex items-center gap-3.5 text-slate text-sm transition-colors hover:text-navy"
            to="/"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.5} />
            Settings
          </Link>
          <Header />
          <DuplicatesList />
        </div>
      </div>
      <BottomNav />
    </>
  );
}

/** Loading frame — mirrors {@link DuplicatesPage}: static header + skeleton
 * rows inside the settings shell (desktop) and the mobile column. */
function PendingDuplicates() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex w-full gap-10 px-10 py-10">
          <SettingsNav />
          <div className="flex min-w-0 grow flex-col">
            <Header />
            <SkeletonList count={3} />
          </div>
        </div>
      </AdminSidebar>
      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto w-full max-w-[640px] px-5 pt-5 sm:px-8 sm:pt-8">
          <Header />
          <SkeletonList count={3} />
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function Header() {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
        Maintenance
      </p>
      <h1 className="font-semibold text-[26px] text-navy leading-[100%] tracking-[-0.02em] lg:text-[36px]">
        Merge duplicates
      </h1>
      <p className="mt-2 max-w-prose text-slate text-sm leading-relaxed">
        Same property listed on more than one portal? These look like the same
        home — compare them side by side, then choose which to keep, which to
        merge in, and skip any that aren't actually the same. Merging keeps one
        card and folds in any swipes you've already made.
      </p>
    </div>
  );
}

function DuplicatesList() {
  // Loader prefetches via `ensureQueryData`; pendingComponent owns the
  // loading frame and the router errorComponent owns failures.
  const { data } = useSuspenseQuery(duplicatesQueryOptions);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white px-5 py-8 text-center">
        <p className="font-medium text-navy text-sm">No duplicates found</p>
        <p className="mt-1 text-slate text-sm">
          Every property currently maps to a single cluster.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((group) => (
        <DuplicateGroupCard
          group={group}
          key={group.clusters.map((c) => c.clusterId).join("-")}
        />
      ))}
    </div>
  );
}

/** Drop a resolved group (merged or dismissed) from the cached list so the
 * card disappears immediately, before the refetch lands. */
function dropGroup(
  prev: DuplicateGroup[] | undefined,
  group: DuplicateGroup
): DuplicateGroup[] | undefined {
  if (!prev) {
    return prev;
  }
  const ids = new Set(group.clusters.map((c) => c.clusterId));
  return prev.filter((g) => !g.clusters.every((c) => ids.has(c.clusterId)));
}

function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const qc = useQueryClient();
  // Selection model: at MOST one survivor (kept) + a set of skipped
  // clusters; every other cluster is "merge" (folded into the survivor).
  // `survivor` can be null — flipping the kept column to merge/skip simply
  // clears it rather than auto-promoting a neighbour, which is what caused
  // the "keep" highlight to ping-pong between columns. You then explicitly
  // tap Keep on the one you want.
  const [survivor, setSurvivor] = useState<string | null>(
    group.suggestedSurvivorId
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const absorbedIds =
    survivor == null
      ? []
      : group.clusters
          .map((c) => c.clusterId)
          .filter((id) => id !== survivor && !skipped.has(id));

  const roleOf = (id: string): MergeRole => {
    if (id === survivor) {
      return "keep";
    }
    return skipped.has(id) ? "skip" : "merge";
  };

  const setRole = (id: string, role: MergeRole) => {
    setError(null);
    if (role === "keep") {
      // Promote this column; whatever was kept before becomes "merge".
      setSurvivor(id);
      setSkipped((s) => {
        if (!s.has(id)) {
          return s;
        }
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      return;
    }
    // merge or skip: if this WAS the kept column, just clear the crown —
    // don't shove it onto a neighbour. The group is then survivor-less
    // until you tap Keep on the one you actually want.
    if (id === survivor) {
      setSurvivor(null);
    }
    setSkipped((s) => {
      const n = new Set(s);
      if (role === "skip") {
        n.add(id);
      } else {
        n.delete(id);
      }
      return n;
    });
  };

  const merge = useMutation({
    mutationFn: () => {
      if (survivor == null) {
        throw new Error("Pick which one to keep first.");
      }
      return mergeClusters({
        data: {
          survivorClusterId: survivor,
          absorbedClusterIds: absorbedIds,
        },
      });
    },
    onMutate: async () => {
      setError(null);
      await qc.cancelQueries({ queryKey: queryKeys.duplicates() });
      const previous = qc.getQueryData<DuplicateGroup[]>(
        duplicatesQueryOptions.queryKey
      );
      qc.setQueryData(
        duplicatesQueryOptions.queryKey,
        (prev?: DuplicateGroup[]) => dropGroup(prev, group)
      );
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(duplicatesQueryOptions.queryKey, ctx.previous);
      }
      setError(e.message ?? "Merge failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.duplicates() });
      qc.invalidateQueries({ queryKey: queryKeys.review() });
      qc.invalidateQueries({ queryKey: queryKeys.shortlist() });
    },
  });

  const dismiss = useMutation({
    mutationFn: () =>
      dismissDuplicateSuggestion({
        data: { clusterIds: group.clusters.map((c) => c.clusterId) },
      }),
    onMutate: async () => {
      setError(null);
      await qc.cancelQueries({ queryKey: queryKeys.duplicates() });
      const previous = qc.getQueryData<DuplicateGroup[]>(
        duplicatesQueryOptions.queryKey
      );
      qc.setQueryData(
        duplicatesQueryOptions.queryKey,
        (prev?: DuplicateGroup[]) => dropGroup(prev, group)
      );
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(duplicatesQueryOptions.queryKey, ctx.previous);
      }
      setError(e.message ?? "Couldn't dismiss");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.duplicates() });
    },
  });

  const busy = merge.isPending || dismiss.isPending;
  const canMerge = survivor != null && absorbedIds.length >= 1;

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
        {group.clusters.length} possible matches · keep one, merge the same
        ones in, skip any that aren't
      </p>

      <DuplicateCompare
        clusters={group.clusters}
        onSetRole={setRole}
        roleOf={roleOf}
      />

      {error ? (
        <p className="mt-3 text-xs" style={{ color: "#b4472a" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            setError(null);
            dismiss.mutate();
          }}
          size="sm"
          variant="ghost"
        >
          {dismiss.isPending ? "Dismissing…" : "Not duplicates"}
        </Button>
        <Button
          disabled={busy || !canMerge}
          onClick={() => {
            setError(null);
            merge.mutate();
          }}
          size="sm"
        >
          {merge.isPending
            ? "Merging…"
            : `Merge ${absorbedIds.length} into the kept one`}
        </Button>
      </div>
    </div>
  );
}
