/**
 * `/searches/$id` — edit an existing search.
 *
 * Reuses the same SearchForm; hydrates the form from the stored row
 * (excludeOutcodes / commuteTargets / transportTargets are now all
 * first-class columns on `searches`) and the schedule's cron (looked
 * up by externalId, falling back to "off" if no schedule exists).
 *
 * Two mutations live here — `updateSearch` and `archiveSearch`. Both
 * are optimistic against the `["searches"]` list cache and patch the
 * single-search cache. Pattern matches `src/routes/index.tsx` (the
 * gold-standard swipe mutation): cancel → snapshot → patch → onError
 * restore → onSettled invalidate. Hard deletes are intentionally not
 * exposed — archiving (pausing) is the only destructive option.
 */
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DesktopSearchCreate } from "../../components/search-form/desktop-search-create";
import {
  DEFAULT_FORM_VALUES,
  SearchForm,
  type SearchFormValues,
  bathOptionFor,
  bedOptionFor,
} from "../../components/search-form/search-form";
import { Button } from "../../components/ui/button";
import { requireSession } from "../../lib/auth-guard";
import { findCadenceByCron, findCadenceById } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { listSchedules } from "../../server/functions/schedules";
import {
  type SearchRow,
  archiveSearch,
  getSearch,
  updateSearch,
} from "../../server/functions/searches";

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
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.search(params.id),
        queryFn: () => getSearch({ data: { id: params.id } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.schedules(),
        queryFn: () => listSchedules(),
        staleTime: 30_000,
      }),
    ]);
    return { search, schedules };
  },
  component: EditSearchPage,
});

function EditSearchPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: search } = useSuspenseQuery({
    queryKey: queryKeys.search(params.id),
    queryFn: () => getSearch({ data: { id: params.id } }),
  });
  const { data: schedules } = useSuspenseQuery({
    queryKey: queryKeys.schedules(),
    queryFn: () => listSchedules(),
  });

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

  const pending = update.isPending || archive.isPending;

  const pauseAction = {
    label: search.active ? "Pause search" : "Paused",
    disabled: pending || !search.active,
    onClick: () => archive.mutate(),
    pending: archive.isPending,
    pendingLabel: "Pausing…",
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
        initial={initial}
        mode="edit"
        onCancel={() => navigate({ to: "/searches" })}
        onSubmit={(v) => update.mutate(v)}
        pauseAction={pauseAction}
        pending={pending}
      />
      <div className="md:hidden">
        <SearchForm
          initial={initial}
          mode="edit"
          onCancel={() => navigate({ to: "/searches" })}
          onSubmit={(v) => update.mutate(v)}
          pending={pending}
        />
        <div className="mx-auto flex max-w-md justify-end border-border border-t bg-card px-5 py-3">
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
  if (min >= 4) {
    return "4+";
  }
  if (min === 3) {
    return "3+";
  }
  return "1+";
}
