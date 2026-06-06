/**
 * `/searches/$id` — edit an existing search.
 *
 * Reuses the same SearchForm; hydrates the form from the stored row
 * (excludeOutcodes / commuteTargets / transportTargets are now all
 * first-class columns on `searches`) and the schedule's cron (looked
 * up by externalId, falling back to "off" if no schedule exists).
 *
 * Three mutations live here — `updateSearch`, `archiveSearch` (pause),
 * and `deleteSearch` (soft delete). All are optimistic against the
 * `["searches"]` list cache and patch the single-search cache. Pattern
 * matches `src/routes/index.tsx` (the gold-standard swipe mutation):
 * cancel → snapshot → patch → onError restore → onSettled invalidate.
 * Delete is a soft delete (stamps `deleted_at`): the row drops out of
 * the list optimistically, but its history survives and it's recoverable.
 */
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { DesktopSearchCreate } from "../../components/search-form/desktop-search-create";
import {
  DEFAULT_FORM_VALUES,
  SearchForm,
  type SearchFormValues,
  bathOptionFor,
  bedOptionFor,
} from "../../components/search-form/search-form";
import { Button } from "../../components/ui/button";
import {
  SkeletonForm,
  SkeletonPageHeader,
} from "../../components/ui/patterns/skeletons";
import { requireSession } from "../../lib/auth-guard";
import { findCadenceByCron, findCadenceById } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { listSchedules } from "../../server/functions/schedules";
import {
  type SearchRow,
  archiveSearch,
  backfillSearchNow,
  deleteSearch,
  getSearch,
  runSearchNow,
  updateSearch,
} from "../../server/functions/searches";

// Shared query options so the loader prefetch and the component's
// `useSuspenseQuery` can't drift (same key, same staleTime). 30s matches
// the searches-list / schedules screens.
const searchQueryOptions = (id: string) => ({
  queryKey: queryKeys.search(id),
  queryFn: () => getSearch({ data: { id } }),
  staleTime: 30_000,
});

const schedulesQueryOptions = {
  queryKey: queryKeys.schedules(),
  queryFn: () => listSchedules(),
  staleTime: 30_000,
};

export const Route = createFileRoute("/searches/$id")({
  head: (ctx) => {
    const data = ctx.loaderData as { search: SearchRow } | undefined;
    return {
      meta: [
        {
          title: data?.search.name
            ? `${data.search.name} · Gaff`
            : "Search · Gaff",
        },
      ],
    };
  },
  beforeLoad: ({ context, params }) => {
    requireSession(
      context as { currentUserId: string | null },
      `/searches/${params.id}`
    );
  },
  loader: async ({ params, context }) => {
    const [search, schedules] = await Promise.all([
      context.queryClient.ensureQueryData(searchQueryOptions(params.id)),
      context.queryClient.ensureQueryData(schedulesQueryOptions),
    ]);
    return { search, schedules };
  },
  pendingComponent: PendingSearchDetail,
  component: EditSearchPage,
});

/** Loading frame — the edit form's shape (header + field column) in the
 * desktop shell and the mobile container. */
function PendingSearchDetail() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="mx-auto w-full max-w-[640px] px-10 py-10">
          <SkeletonPageHeader className="mb-8" />
          <SkeletonForm fields={6} />
        </div>
      </AdminSidebar>
      <div className="mx-auto min-h-screen max-w-md bg-background px-5 pt-6 pb-24 sm:max-w-2xl lg:hidden">
        <SkeletonPageHeader className="mb-6" />
        <SkeletonForm fields={6} />
      </div>
    </>
  );
}

function EditSearchPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: search } = useSuspenseQuery(searchQueryOptions(params.id));
  const { data: schedules } = useSuspenseQuery(schedulesQueryOptions);

  const initial = toFormValues(search, schedules);

  const update = useMutation({
    mutationFn: (values: SearchFormValues) => {
      const beds = bedOptionFor(values.bedsId);
      const baths = bathOptionFor(values.bathsId);
      const cadence = findCadenceById(values.cadenceId);
      if (!values.location) {
        throw new Error("location is required");
      }
      return updateSearch({
        data: {
          id: params.id,
          name: values.name,
          portals: values.portals,
          location: values.location,
          excludeLocations: values.excludeLocations,
          minBedrooms: beds.min,
          maxBedrooms: beds.max,
          minBathrooms: baths.min,
          maxBathrooms: baths.max,
          minPrice: values.minPrice,
          maxPrice: values.maxPrice,
          radiusMiles: values.radiusMiles,
          propertyTypes: values.propertyTypes,
          furnished: values.furnished,
          mustHaves: values.mustHaves,
          exclusions: values.exclusions,
          commuteTargets: values.commuteTargets,
          transportTargets: values.transportTargets,
          cron: cadence.cron,
        },
      });
    },
    onMutate: async (values) => {
      await qc.cancelQueries({ queryKey: queryKeys.searches() });
      await qc.cancelQueries({ queryKey: queryKeys.search(params.id) });
      const prevList = qc.getQueryData<SearchRow[]>(queryKeys.searches());
      const prevOne = qc.getQueryData<SearchRow>(queryKeys.search(params.id));
      const patch = buildPatch(values, search);
      // Patch the single-search cache so the form re-hydrates against
      // the optimistic shape if the user navigates away and back.
      if (prevOne) {
        qc.setQueryData<SearchRow>(queryKeys.search(params.id), {
          ...prevOne,
          ...patch,
        });
      }
      // Patch the list cache so `/searches` reflects the edit instantly.
      if (prevList) {
        qc.setQueryData<SearchRow[]>(queryKeys.searches(), (old) =>
          (old ?? []).map((row) =>
            row.id === params.id ? { ...row, ...patch } : row
          )
        );
      }
      return { prevList, prevOne };
    },
    onSuccess: () => {
      navigate({ to: "/searches" });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prevList !== undefined) {
        qc.setQueryData(queryKeys.searches(), ctx.prevList);
      }
      if (ctx?.prevOne !== undefined) {
        qc.setQueryData(queryKeys.search(params.id), ctx.prevOne);
      }
      setError(e.message ?? "Something went wrong");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.searches() });
      qc.invalidateQueries({ queryKey: queryKeys.search(params.id) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });

  const archive = useMutation({
    mutationFn: () => archiveSearch({ data: { id: params.id } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.searches() });
      await qc.cancelQueries({ queryKey: queryKeys.search(params.id) });
      const prevList = qc.getQueryData<SearchRow[]>(queryKeys.searches());
      const prevOne = qc.getQueryData<SearchRow>(queryKeys.search(params.id));
      if (prevOne) {
        qc.setQueryData<SearchRow>(queryKeys.search(params.id), {
          ...prevOne,
          active: false,
        });
      }
      if (prevList) {
        qc.setQueryData<SearchRow[]>(queryKeys.searches(), (old) =>
          (old ?? []).map((row) =>
            row.id === params.id ? { ...row, active: false } : row
          )
        );
      }
      return { prevList, prevOne };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prevList !== undefined) {
        qc.setQueryData(queryKeys.searches(), ctx.prevList);
      }
      if (ctx?.prevOne !== undefined) {
        qc.setQueryData(queryKeys.search(params.id), ctx.prevOne);
      }
      setError(e.message ?? "Couldn't archive");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.searches() });
      qc.invalidateQueries({ queryKey: queryKeys.search(params.id) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });

  // Soft delete — drop the row from the list cache optimistically (it's
  // filtered out server-side by `deleted_at`), then navigate away. Unlike
  // archive, there's no single-search patch worth keeping: we're leaving
  // the page. onError restores the list and surfaces the message.
  const remove = useMutation({
    mutationFn: () => deleteSearch({ data: { id: params.id } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.searches() });
      const prevList = qc.getQueryData<SearchRow[]>(queryKeys.searches());
      if (prevList) {
        qc.setQueryData<SearchRow[]>(queryKeys.searches(), (old) =>
          (old ?? []).filter((row) => row.id !== params.id)
        );
      }
      return { prevList };
    },
    onSuccess: () => {
      navigate({ to: "/searches" });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prevList !== undefined) {
        qc.setQueryData(queryKeys.searches(), ctx.prevList);
      }
      setError(e.message ?? "Couldn't delete");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.searches() });
      qc.invalidateQueries({ queryKey: queryKeys.search(params.id) });
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });

  const scrape = useMutation({
    mutationFn: () => runSearchNow({ data: { id: params.id } }),
    onError: (e: Error) => {
      setError(
        e.message === "no_portals_selected"
          ? "Select at least one portal before scraping."
          : (e.message ?? "Couldn't start scrape")
      );
    },
  });

  const backfill = useMutation({
    mutationFn: () => backfillSearchNow({ data: { id: params.id } }),
    onError: (e: Error) => {
      setError(
        e.message === "no_portals_selected"
          ? "Select at least one portal before backfilling."
          : (e.message ?? "Couldn't start backfill")
      );
    },
  });

  const pending = update.isPending || archive.isPending || remove.isPending;

  const scrapeAction = {
    label: scrape.isSuccess ? "Scrape started" : "Scrape now",
    disabled: pending || scrape.isPending || !search.active,
    onClick: () => scrape.mutate(),
    pending: scrape.isPending,
    pendingLabel: "Starting…",
  };

  const backfillAction = {
    label: backfill.isSuccess ? "Backfill started" : "Backfill now",
    disabled: pending || backfill.isPending || !search.active,
    onClick: () => {
      const ok = window.confirm(
        `Backfill "${search.name}"? This does a one-off full-depth scrape across every portal — slower and more costly than the daily run. It catches up the whole current inventory.`
      );
      if (ok) {
        backfill.mutate();
      }
    },
    pending: backfill.isPending,
    pendingLabel: "Starting…",
  };

  const pauseAction = {
    label: search.active ? "Pause search" : "Paused",
    disabled: pending || !search.active,
    onClick: () => archive.mutate(),
    pending: archive.isPending,
    pendingLabel: "Pausing…",
  };

  const deleteAction = {
    label: "Delete",
    disabled: pending,
    onClick: () => {
      const ok = window.confirm(
        `Delete "${search.name}"? It'll be removed from your searches. Your match history is kept and the delete can be reversed.`
      );
      if (ok) {
        remove.mutate();
      }
    },
    pending: remove.isPending,
    pendingLabel: "Deleting…",
  };

  return (
    <>
      {error && (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
        >
          {error}
        </div>
      )}
      <DesktopSearchCreate
        backfillAction={backfillAction}
        deleteAction={deleteAction}
        initial={initial}
        mode="edit"
        onCancel={() => navigate({ to: "/searches" })}
        onSubmit={(v) => update.mutate(v)}
        pauseAction={pauseAction}
        pending={pending}
        scrapeAction={scrapeAction}
      />
      <div className="lg:hidden">
        <SearchForm
          initial={initial}
          mode="edit"
          onCancel={() => navigate({ to: "/searches" })}
          onSubmit={(v) => update.mutate(v)}
          pending={pending}
        />
        <div className="mx-auto flex max-w-md justify-end gap-2 border-border border-t bg-card px-5 py-3 sm:max-w-2xl">
          <Button
            disabled={scrapeAction.disabled}
            loading={scrape.isPending}
            loadingText="Starting…"
            onClick={scrapeAction.onClick}
            size="sm"
            type="button"
            variant="outline"
          >
            {scrapeAction.label}
          </Button>
          <Button
            disabled={backfillAction.disabled}
            loading={backfill.isPending}
            loadingText="Starting…"
            onClick={backfillAction.onClick}
            size="sm"
            type="button"
            variant="outline"
          >
            {backfillAction.label}
          </Button>
          <Button
            disabled={deleteAction.disabled}
            loading={remove.isPending}
            loadingText="Deleting…"
            onClick={deleteAction.onClick}
            size="sm"
            type="button"
            variant="destructive"
          >
            {deleteAction.label}
          </Button>
          <Button
            disabled={pauseAction.disabled}
            loading={archive.isPending}
            loadingText="Pausing…"
            onClick={pauseAction.onClick}
            size="sm"
            type="button"
            variant="outline"
          >
            {pauseAction.label}
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Build the optimistic patch for `["searches", id]` from form values.
 * Mirrors the shape the server will write so the cache update converges
 * with the eventual response.
 */
function buildPatch(
  values: SearchFormValues,
  existing: SearchRow
): Partial<SearchRow> {
  const beds = bedOptionFor(values.bedsId);
  const baths = bathOptionFor(values.bathsId);
  const cadence = findCadenceById(values.cadenceId);
  return {
    name: values.name,
    portals: values.portals,
    location: values.location ?? existing.location,
    excludeLocations: values.excludeLocations,
    minBedrooms: beds.min,
    maxBedrooms: beds.max,
    minBathrooms: baths.min,
    maxBathrooms: baths.max,
    minPrice: values.minPrice,
    maxPrice: values.maxPrice,
    radiusMiles: values.radiusMiles.toFixed(2),
    propertyTypes: values.propertyTypes,
    furnished: values.furnished,
    mustHaves: values.mustHaves,
    exclusions: values.exclusions,
    commuteTargets: values.commuteTargets,
    transportTargets: values.transportTargets,
    active: cadence.cron !== null,
    updatedAt: new Date(),
    // Preserve the immutable identifiers.
    id: existing.id,
    householdId: existing.householdId,
    createdAt: existing.createdAt,
  };
}

/** Hydrate the form from the stored row + matching schedule (if any). */
function toFormValues(
  search: Awaited<ReturnType<typeof getSearch>>,
  schedules: Awaited<ReturnType<typeof listSchedules>>
): Partial<SearchFormValues> {
  const matching = schedules.find((s) => s.externalId === search.id);
  const bedsId =
    search.minBedrooms === null
      ? DEFAULT_FORM_VALUES.bedsId
      : pickBedsId(search.minBedrooms);
  const bathsId = pickBathsId(search.minBathrooms, search.maxBathrooms);
  const cron = matching ? matching.generator.expression : null;
  const cadence = matching ? findCadenceByCron(cron) : findCadenceById("off");

  return {
    name: search.name,
    location: search.location,
    excludeLocations: search.excludeLocations,
    radiusMiles: Number(search.radiusMiles),
    minPrice: search.minPrice ?? DEFAULT_FORM_VALUES.minPrice,
    maxPrice: search.maxPrice ?? DEFAULT_FORM_VALUES.maxPrice,
    bedsId,
    bathsId,
    propertyTypes: search.propertyTypes,
    furnished: search.furnished as SearchFormValues["furnished"],
    mustHaves: search.mustHaves as SearchFormValues["mustHaves"],
    exclusions: search.exclusions as SearchFormValues["exclusions"],
    commuteTargets: search.commuteTargets,
    transportTargets: search.transportTargets,
    portals: search.portals as SearchFormValues["portals"],
    cadenceId: cadence.id,
  };
}

function pickBedsId(min: number): string {
  // Beds are min-only now (1+, 2+, 3+, 4+). Rows written under the old
  // explicit `(min, max)` encoding still hydrate cleanly — we just snap
  // to the closest "N+" pill and drop `max` on read.
  const clamped = Math.max(1, Math.min(min, 4));
  return `${clamped}+`;
}

/**
 * Maps stored (min, max) bathrooms back to one of the BATH_OPTIONS ids
 * (1+, 2, 3+, 4+). The "2" pill is the only exact match; anything else
 * snaps to the surrounding "+" bucket. `null` min defaults to "1+".
 */
function pickBathsId(min: number | null, max: number | null): string {
  if (min === null) {
    return DEFAULT_FORM_VALUES.bathsId;
  }
  if (min === 2 && max === 2) {
    return "2";
  }
  // The form's bath segments are 1+, 2, 3+ (no 4+). Rows written under
  // the old explicit 4+ bucket snap up to the "3+" segment on read.
  if (min >= 3) {
    return "3+";
  }
  return "1+";
}
