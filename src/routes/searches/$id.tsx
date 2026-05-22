/**
 * `/searches/$id` — edit an existing search.
 *
 * Reuses the same SearchForm; hydrates the form from the stored row
 * (including the EXCLUDE outcodes tucked into `aiRules.excludeOutcodes`)
 * and the schedule's cron (looked up by externalId, falling back to
 * "off" if no schedule exists).
 */
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  DEFAULT_FORM_VALUES,
  SearchForm,
  type SearchFormValues,
  bathOptionFor,
  bedOptionFor,
} from "../../components/search-form/search-form";
import { findCadenceByCron, findCadenceById } from "../../lib/cron-presets";
import { listSchedules } from "../../server/functions/schedules";
import {
  getSearch,
  readAiRules,
  updateSearch,
} from "../../server/functions/searches";

export const Route = createFileRoute("/searches/$id")({
  loader: async ({ params, context }) => {
    const [search, schedules] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["search", params.id] as const,
        queryFn: () => getSearch({ data: { id: params.id } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["schedules"] as const,
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
    queryKey: ["search", params.id] as const,
    queryFn: () => getSearch({ data: { id: params.id } }),
  });
  const { data: schedules } = useSuspenseQuery({
    queryKey: ["schedules"] as const,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["searches"] });
      qc.invalidateQueries({ queryKey: ["search", params.id] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      navigate({ to: "/searches" });
    },
    onError: (e: Error) => {
      setError(e.message ?? "Something went wrong");
    },
  });

  return (
    <>
      {error && (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-ink px-4 py-3 text-bone text-sm shadow-lg"
        >
          {error}
        </div>
      )}
      <SearchForm
        initial={initial}
        mode="edit"
        onCancel={() => navigate({ to: "/searches" })}
        onSubmit={(v) => update.mutate(v)}
        pending={update.isPending}
      />
    </>
  );
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
