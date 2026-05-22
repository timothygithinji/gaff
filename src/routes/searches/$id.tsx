/**
 * `/searches/$id` — edit an existing search.
 *
 * Reuses the same SearchForm; hydrates the form from the stored row
 * (including the EXCLUDE outcodes tucked into `aiRules.excludeOutcodes`)
 * and the schedule's cron (looked up by externalId, falling back to
 * "off" if no schedule exists).
 *
 * Three mutations live here — `updateSearch`, `archiveSearch`, and
 * `deleteSearch`. All three are optimistic against the `["searches"]`
 * list cache; update + archive also patch the single-search cache.
 * Pattern matches `src/routes/index.tsx` (the gold-standard swipe
 * mutation): cancel → snapshot → patch → onError restore → onSettled
 * invalidate.
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
import { requireSession } from "../../lib/auth-guard";
import { findCadenceByCron, findCadenceById } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { listSchedules } from "../../server/functions/schedules";
import {
  type SearchRow,
  archiveSearch,
  deleteSearch,
  getSearch,
  readAiRules,
  updateSearch,
} from "../../server/functions/searches";

export const Route = createFileRoute("/searches/$id")({
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
      return updateSearch({
        data: {
          id: params.id,
          name: values.name,
          portals: values.portals,
          outcodes: values.outcodesInclude,
          excludeOutcodes: values.outcodesExclude,
          minBedrooms: beds.min,
          maxBedrooms: beds.max,
          minBathrooms: baths.min,
          maxBathrooms: baths.max,
          minPrice: values.minPrice,
          maxPrice: values.maxPrice,
          propertyTypes: [],
          commuteTargets: values.commute ? [values.commute] : [],
          aiRules: values.aiRules,
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

  const remove = useMutation({
    mutationFn: () => deleteSearch({ data: { id: params.id } }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.searches() });
      const prevList = qc.getQueryData<SearchRow[]>(queryKeys.searches());
      if (prevList) {
        qc.setQueryData<SearchRow[]>(
          queryKeys.searches(),
          prevList.filter((row) => row.id !== params.id)
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
      qc.invalidateQueries({ queryKey: queryKeys.schedules() });
    },
  });

  const pending = update.isPending || archive.isPending || remove.isPending;

  const pauseAction = {
    label: search.active ? "Pause search" : "Paused",
    disabled: pending || !search.active,
    onClick: () => archive.mutate(),
  };
  const deleteAction = {
    label: "Delete search",
    disabled: pending,
    onClick: () => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this search? This can't be undone.")
      ) {
        return;
      }
      remove.mutate();
    },
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
        deleteAction={deleteAction}
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
        <div className="mx-auto flex max-w-md justify-between gap-2 border-border border-t bg-card px-5 py-3">
          <button
            className="rounded-md border border-border px-4 py-2 text-muted-foreground text-xs"
            disabled={pauseAction.disabled}
            onClick={pauseAction.onClick}
            type="button"
          >
            {pauseAction.label}
          </button>
          <button
            className="rounded-md bg-[#B05A38]/10 px-4 py-2 text-[#B05A38] text-xs"
            disabled={deleteAction.disabled}
            onClick={deleteAction.onClick}
            type="button"
          >
            {deleteAction.label}
          </button>
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
  const cadence = findCadenceById(values.cadenceId);
  return {
    name: values.name,
    portals: values.portals,
    outcodes: values.outcodesInclude.map((o) => o.trim().toUpperCase()),
    minBedrooms: beds.min,
    maxBedrooms: beds.max,
    minPrice: values.minPrice,
    maxPrice: values.maxPrice,
    propertyTypes: [],
    commuteTargets: values.commute ? [values.commute] : [],
    aiRules: {
      rules: values.aiRules,
      excludeOutcodes: values.outcodesExclude.map((o) =>
        o.trim().toUpperCase()
      ),
    },
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
  const stored = readAiRules(search.aiRules);
  const bedsId =
    search.minBedrooms === null
      ? DEFAULT_FORM_VALUES.bedsId
      : pickBedsId(search.minBedrooms, search.maxBedrooms);
  const bathsId = pickBathsId(
    DEFAULT_FORM_VALUES.bathsId,
    search.commuteTargets
  );
  const cron = matching ? matching.generator.expression : null;
  const cadence = matching ? findCadenceByCron(cron) : findCadenceById("off");

  return {
    name: search.name,
    outcodesInclude: search.outcodes,
    outcodesExclude: stored.excludeOutcodes,
    minPrice: search.minPrice ?? DEFAULT_FORM_VALUES.minPrice,
    maxPrice: search.maxPrice ?? DEFAULT_FORM_VALUES.maxPrice,
    bedsId,
    bathsId,
    aiRules:
      stored.rules.length > 0 ? stored.rules : DEFAULT_FORM_VALUES.aiRules,
    commute: search.commuteTargets[0] ?? null,
    portals: search.portals as SearchFormValues["portals"],
    cadenceId: cadence.id,
  };
}

function pickBedsId(min: number, max: number | null): string {
  if (min >= 4) {
    return "4+";
  }
  return String(Math.max(1, Math.min(min, max ?? min)));
}

/**
 * Baths column isn't on the row directly — keep the form-default until
 * we add `(minBathrooms, maxBathrooms)` to the table. The signature
 * keeps `commuteTargets` referenced so the compiler doesn't trim it.
 */
function pickBathsId(
  fallback: string,
  _commuteTargets: { label: string }[]
): string {
  return fallback;
}
