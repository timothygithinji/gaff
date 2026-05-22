/**
 * `/searches/new` — full-screen modal-style create flow.
 *
 * Submits to `createSearch` which writes the row + Trigger.dev schedule
 * in one round-trip. Optimistically navigates to `/searches` on success;
 * a Radix Toast surfaces failure (rare — server-side Zod will catch
 * shape errors before they reach the DB).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  SearchForm,
  type SearchFormValues,
  bathOptionFor,
  bedOptionFor,
} from "../../components/search-form/search-form";
import { findCadenceById } from "../../lib/cron-presets";
import { createSearch } from "../../server/functions/searches";

export const Route = createFileRoute("/searches/new")({
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
      const cadence = findCadenceById(values.cadenceId);
      return createSearch({
        data: {
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
        mode="create"
        onCancel={() => navigate({ to: "/searches" })}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
      />
    </>
  );
}
