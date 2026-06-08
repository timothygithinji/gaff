/**
 * `/searches/new` — full-screen modal-style create flow.
 *
 * Submits to `createSearch` which writes the row + Trigger.dev schedule
 * in one round-trip. Optimistic UX: we synthesise a placeholder row with
 * a `tmp-` id and prepend it to the `["searches"]` cache so the list
 * paints instantly, then `onSettled` invalidates to reconcile with the
 * server's real id. Navigation to `/searches` still happens on success;
 * a sticky banner surfaces failure (rare — server-side Zod will catch
 * shape errors before they reach the DB).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { nanoid } from "nanoid";
import { useState } from "react";
import { DesktopSearchCreate } from "../../components/search-form/desktop-search-create";
import {
  SearchForm,
  type SearchFormValues,
  bathOptionFor,
  bedOptionFor,
} from "../../components/search-form/search-form";
import { requireSession } from "../../lib/auth-guard";
import { buildCron, findCadenceById } from "../../lib/cron-presets";
import { queryKeys } from "../../lib/query-keys";
import { type SearchRow, createSearch } from "../../server/functions/searches";

export const Route = createFileRoute("/searches/new")({
  head: () => ({ meta: [{ title: "New search · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/searches/new"
    );
  },
  component: NewSearchPage,
});

function NewSearchPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (values: SearchFormValues) => {
      const beds = bedOptionFor(values.bedsId);
      const baths = bathOptionFor(values.bathsId);
      if (!values.location) {
        // canSubmit gates this, but TypeScript needs the narrow.
        throw new Error("location is required");
      }
      return createSearch({
        data: {
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
          cron: buildCron(values.cadenceId, values.anchorHour),
        },
      });
    },
    onMutate: async (values) => {
      // Optimistic: prepend a synthesized row to the searches cache so
      // `/searches` paints the new card the moment the user submits.
      await qc.cancelQueries({ queryKey: queryKeys.searches() });
      const prev = qc.getQueryData<SearchRow[]>(queryKeys.searches());
      const tmpRow = synthesizeSearchRow(values);
      qc.setQueryData<SearchRow[]>(queryKeys.searches(), (old) =>
        old ? [tmpRow, ...old] : [tmpRow]
      );
      return { prev };
    },
    onSuccess: () => {
      navigate({ to: "/searches" });
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.searches(), ctx.prev);
      }
      setError(e.message ?? "Something went wrong");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.searches() });
    },
  });

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
        mode="create"
        onCancel={() => navigate({ to: "/searches" })}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
      />
      <div className="lg:hidden">
        <SearchForm
          mode="create"
          onCancel={() => navigate({ to: "/searches" })}
          onSubmit={(v) => create.mutate(v)}
          pending={create.isPending}
        />
      </div>
    </>
  );
}

/**
 * Build a placeholder SearchRow we can drop into the cache before the
 * server responds. The id is `tmp-…` so any code that reconciles cached
 * rows against the server's response can spot and replace it.
 */
function synthesizeSearchRow(values: SearchFormValues): SearchRow {
  const beds = bedOptionFor(values.bedsId);
  const baths = bathOptionFor(values.bathsId);
  const cadence = findCadenceById(values.cadenceId);
  const now = new Date();
  // canSubmit gates the mutation; if values.location is null here it
  // means the mutation was triggered programmatically — synthesise a
  // placeholder so the cache row doesn't crash the list render.
  const location = values.location ?? {
    placeId: "",
    name: "—",
    formattedAddress: "—",
    type: "postal_code" as const,
    lat: 0,
    lng: 0,
    bounds: null,
    portalRefs: {},
  };
  return {
    id: `tmp-${nanoid()}`,
    householdId: "",
    name: values.name,
    portals: values.portals,
    location,
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
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
