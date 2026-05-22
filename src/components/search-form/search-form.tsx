/**
 * The shared Search create / edit form.
 *
 * `/searches/new` and `/searches/$id` both mount this with different
 * `mode` + `initial` props. State lives in React Hook Form so the cost
 * estimate, CTA disabled-ness, etc. all stay in sync via `watch()` —
 * Zod validation runs on submit (the server function will re-validate
 * authoritatively).
 *
 * The layout mirrors the "Search create" Paper artboard:
 * eyebrow + tap-to-edit headline → Postcodes (INCLUDE + EXCLUDE chips)
 * → Price slider + Bed/Bath pills → AI floor plan rules
 * → Commute target → Portals → Re-scrape cadence → sticky CTA footer.
 */
import { useForm } from "react-hook-form";
import {
  type Portal,
  estimateCost,
  estimateListingsPerWeek,
} from "../../lib/cost-estimate";
import { findCadenceById } from "../../lib/cron-presets";
import {
  type AiRule,
  AiRulesEditor,
  DEFAULT_AI_RULES,
} from "./ai-rules-editor";
import {
  BATH_OPTIONS,
  BED_OPTIONS,
  type BathOption,
  type BedOption,
  PillGroup,
} from "./bed-bath-pills";
import { CadencePicker } from "./cadence-picker";
import { type CommuteTarget, CommuteTargetRow } from "./commute-target-row";
import { CostEstimate } from "./cost-estimate";
import { OutcodeChips } from "./outcode-chips";
import { PortalToggles } from "./portal-toggles";
import { PriceSlider } from "./price-slider";

export type SearchFormValues = {
  name: string;
  outcodesInclude: string[];
  outcodesExclude: string[];
  minPrice: number;
  maxPrice: number;
  bedsId: string;
  bathsId: string;
  aiRules: AiRule[];
  commute: CommuteTarget | null;
  portals: Portal[];
  cadenceId: string;
};

export const DEFAULT_FORM_VALUES: SearchFormValues = {
  name: "A flat in North London",
  outcodesInclude: [],
  outcodesExclude: [],
  minPrice: 2000,
  maxPrice: 2800,
  bedsId: "2",
  bathsId: "1+",
  aiRules: DEFAULT_AI_RULES,
  commute: null,
  portals: ["rightmove", "zoopla", "openrent"],
  cadenceId: "daily",
};

const DEFAULT_BED: BedOption = { id: "2", label: "2", min: 2, max: 2 };
const DEFAULT_BATH: BathOption = { id: "1+", label: "1+", min: 1, max: null };

export function bedOptionFor(id: string): BedOption {
  return BED_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BED;
}

export function bathOptionFor(id: string): BathOption {
  return BATH_OPTIONS.find((b) => b.id === id) ?? DEFAULT_BATH;
}

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
};

export function SearchForm({
  mode,
  initial,
  pending,
  onCancel,
  onReset,
  onSubmit,
}: Props) {
  const defaults = { ...DEFAULT_FORM_VALUES, ...initial };
  const form = useForm<SearchFormValues>({ defaultValues: defaults });
  const watched = form.watch();

  const setField = <K extends keyof SearchFormValues>(
    key: K,
    value: SearchFormValues[K]
  ) => {
    // `form.setValue` has a deeply generic path type. We've already
    // constrained `key` to top-level keys via `K extends keyof
    // SearchFormValues`, so the cast collapses the path inference noise
    // without losing type safety at the call site.
    form.setValue(key as Parameters<typeof form.setValue>[0], value as never, {
      shouldDirty: true,
    });
  };

  const cadence = findCadenceById(watched.cadenceId);
  const cost = estimateCost({
    outcodeCount: watched.outcodesInclude.length,
    portals: watched.portals,
    scrapesPerDay: cadence.scrapesPerDay,
  });
  const listingsPerWeek = estimateListingsPerWeek({
    outcodeCount: watched.outcodesInclude.length,
    portals: watched.portals,
  });

  const canSubmit =
    watched.outcodesInclude.length > 0 &&
    watched.portals.length > 0 &&
    watched.name.trim().length > 0 &&
    watched.minPrice <= watched.maxPrice;

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(form.getValues());
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ground">
      {/* Header — close + title + reset */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-brass/15 border-b bg-paper px-4 py-3">
        <button
          aria-label="Close"
          className="text-ink text-xl leading-none"
          onClick={onCancel}
          type="button"
        >
          ×
        </button>
        <h1 className="font-medium text-ink text-sm">
          {mode === "create" ? "New search" : "Edit search"}
        </h1>
        <button
          className="text-copper text-sm"
          onClick={() => {
            form.reset(DEFAULT_FORM_VALUES);
            onReset?.();
          }}
          type="button"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 space-y-8 px-5 pt-6 pb-8">
        {/* Editable headline */}
        <section>
          <p className="text-[11px] text-brass uppercase tracking-[0.16em]">
            WHAT WE'RE LOOKING FOR
          </p>
          <input
            className="-mx-1 mt-2 w-full bg-transparent px-1 font-serif text-4xl text-ink leading-[1.05] outline-none placeholder:text-brass/50 focus:bg-bone/60"
            onChange={(e) => setField("name", e.target.value)}
            placeholder="A flat in North London"
            value={watched.name}
          />
          <p className="mt-2 text-brass text-xs italic">tap to rename</p>
        </section>

        {/* Postcodes */}
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl text-ink">Postcodes</h2>
            <button
              className="text-copper text-xs"
              onClick={() => {
                /* Map view deferred — PR 8 / 9.5 territory. */
              }}
              type="button"
            >
              ▾ Map
            </button>
          </div>
          <p className="-mt-3 text-brass text-sm">
            Include what you want, kill what you don't.
          </p>
          <OutcodeChips
            countLabel={
              watched.outcodesInclude.length > 0
                ? `${watched.outcodesInclude.length} ${watched.outcodesInclude.length === 1 ? "AREA" : "AREAS"}`
                : undefined
            }
            onChange={(next) => setField("outcodesInclude", next)}
            values={watched.outcodesInclude}
            variant="include"
          />
          <OutcodeChips
            countLabel={
              watched.outcodesExclude.length > 0
                ? `${watched.outcodesExclude.length} ${watched.outcodesExclude.length === 1 ? "AREA" : "AREAS"}`
                : undefined
            }
            onChange={(next) => setField("outcodesExclude", next)}
            values={watched.outcodesExclude}
            variant="exclude"
          />
        </section>

        {/* Price + size */}
        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-ink">Price & size</h2>
          <PriceSlider
            max={5000}
            min={1000}
            onChange={([lo, hi]) => {
              setField("minPrice", lo);
              setField("maxPrice", hi);
            }}
            value={[watched.minPrice, watched.maxPrice]}
          />
          <div className="flex gap-3">
            <PillGroup
              onChange={(id) => setField("bedsId", id)}
              options={BED_OPTIONS}
              selectedId={watched.bedsId}
              title="BEDS"
            />
            <PillGroup
              onChange={(id) => setField("bathsId", id)}
              options={BATH_OPTIONS}
              selectedId={watched.bathsId}
              title="BATHS"
            />
          </div>
        </section>

        {/* AI rules */}
        <section className="space-y-3">
          <p className="text-[11px] text-copper uppercase tracking-[0.16em]">
            + AI FLOOR PLAN RULES
          </p>
          <h2 className="font-serif text-2xl text-ink">What makes it a yes</h2>
          <p className="text-brass text-sm">
            Claude reads every floor plan against these.
          </p>
          <AiRulesEditor
            onChange={(next) => setField("aiRules", next)}
            rules={watched.aiRules}
          />
        </section>

        {/* Commute */}
        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-ink">Commute to</h2>
          <CommuteTargetRow
            onChange={(next) => setField("commute", next)}
            value={watched.commute}
          />
        </section>

        {/* Portals */}
        <section className="space-y-3">
          <h2 className="font-serif text-2xl text-ink">Portals to watch</h2>
          <PortalToggles
            onChange={(next) => setField("portals", next)}
            selected={watched.portals}
          />
        </section>

        {/* Cadence */}
        <section className="space-y-3">
          <CadencePicker
            onChange={(id) => setField("cadenceId", id)}
            perDayUsd={cost.perDayUsd}
            selectedId={watched.cadenceId}
          />
        </section>
      </div>

      <CostEstimate
        ctaLabel={mode === "create" ? "Start watching" : "Save changes"}
        disabled={!canSubmit}
        listingsPerWeek={listingsPerWeek}
        onSubmit={handleSubmit}
        pending={pending}
      />
    </div>
  );
}
