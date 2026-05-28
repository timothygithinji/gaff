/**
 * Render-time denylist for AI-generated highlights / watchouts.
 *
 * "What stands out" should answer a single question: *what would change
 * my decision about this listing?* In practice the model returns plenty
 * of items that don't pass that bar — defaults true of ~95% of London
 * rentals ("Bills not included"), restated specs ("Furnished"), pending
 * enrichment data ("No EPC rating provided"), and items that re-state a
 * user-applied filter ("No pets allowed" when the user hasn't asked for
 * pets).
 *
 * This module strips those items at render time, downstream of the
 * persisted `features` JSON. Defense-in-depth:
 *
 *   - The prompt (`prompt.ts`) tells the model not to surface these
 *     things. New enrichments mostly avoid them.
 *   - This filter catches what slips through AND cleans up the older
 *     v2.0.0 enrichments that were written before the prompt was
 *     tightened — we don't re-run AI to refresh them; we just drop the
 *     noise at read time.
 *
 * Patterns were derived empirically: we ran a `SELECT label, count(*)`
 * over the production enrichments table and identified every label
 * appearing >2× that the user couldn't act on. The list below covers
 * the worst offenders (top 20 watchouts by frequency); the prompt
 * change handles the long tail.
 *
 * Each pattern is a case-insensitive regex on the `label` (not the
 * detail) — labels are short and stable; details contain the model's
 * grounding and are too varied to match reliably.
 */

import type { Features, HighlightItem, WatchoutItem } from "./prompt";

/**
 * Highlight labels that don't change a renter's decision.
 *
 * Each entry is paired with a `why` so anyone tweaking the list later
 * can see what the model was up to without re-querying prod.
 */
const NOISE_HIGHLIGHTS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  // Restated specs — the spec strip on the listing card already shows
  // furnishing, beds, baths. Highlighting them is double-display.
  {
    pattern: /^(furnished|unfurnished|part[- ]furnished)$/i,
    why: "Restates the furnishing chip in the spec row.",
  },
  {
    pattern: /^(two|three|four|five|six) (double )?(bed|bath)rooms?$/i,
    why: "Restates the bedrooms/baths count on the card.",
  },

  // Availability filler — every active listing is "available" by
  // definition.
  {
    pattern: /^available (immediately|now|soon|from)$/i,
    why: "Every listed property is available — surfacing it is noise.",
  },

  // Generic "modern flat" praise. The prompt v2.1 forbids these, but
  // older enrichments still carry them.
  {
    pattern: /^(modern|stylish|spacious|well[- ]presented|bright|cosy) /i,
    why: "Generic agent-listing language with no decision content.",
  },
  {
    pattern: /^(modern|stylish|new|recently|newly) (kitchen|bathroom|fitted|refurbished)( and (kitchen|bathroom))?( throughout)?$/i,
    why: "Standard agent-listing copy; doesn't differentiate listings.",
  },
  {
    pattern: /^wood flooring( throughout)?$/i,
    why: "Standard finish, not a differentiator.",
  },

  // Standard UK rental fittings — every flat has them.
  {
    pattern: /^gas (central )?heating( and double glazing)?$/i,
    why: "Standard for nearly every London rental built before 2010.",
  },
  {
    pattern: /^double glazing$/i,
    why: "Standard fitting; not noteworthy on its own.",
  },

  // Average EPC ratings — A/B/C are the typical range. Only F/G are
  // worth a highlight when paired with bills-status context.
  {
    pattern: /^epc (rating )?[abc]( rated)?$/i,
    why: "Average-or-better EPC isn't a standout; F/G is a watchout, not a highlight.",
  },

  // Agent fees are illegal under the Tenant Fees Act 2019 — flagging
  // their absence is highlighting compliance with the law, not a
  // benefit. If an agent IS charging them, that's a *watchout*, not a
  // negative-space highlight.
  {
    pattern: /^no (agent )?fees( apply| charged)?$/i,
    why: "Charging agent fees is illegal; 'no fees' is the legal baseline, not a positive.",
  },
];

/**
 * Watchout labels that don't change a renter's decision.
 *
 * These are the top noise items from a `SELECT label, count(*)` over
 * prod (top 20 alone account for ~150 of ~400 watchouts). The user can
 * always read the underlying field (deposit, EPC, etc.) in the
 * fineprint — the watchout list is for *active* concerns.
 */
const NOISE_WATCHOUTS: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  // Bills-not-included — the default for ~95% of London rentals. The
  // detail is in the fineprint; only flag if *combined* with poor EPC
  // (the prompt instructs the model to phrase it as a compound).
  {
    pattern: /^bills (not included|excluded|status (unclear|not specified)|not mentioned)$/i,
    why: "Default for most London rentals; visible in fineprint; only matters as a compound watchout.",
  },

  // Deposit at the legal floor / cap — one month's rent is the
  // *minimum* protection landlords offer; flagging it as a caution
  // confuses renters. ABOVE the cap is a real problem (kept).
  {
    pattern: /^deposit (equals|at) (one month'?s rent|legal (limit|maximum|cap)|five weeks'? rent)$/i,
    why: "Legal-floor / legal-cap deposits are tenant-friendly; only *above* the cap is a real watchout.",
  },
  {
    pattern: /^deposit near legal cap$/i,
    why: "Near-cap is the norm; only above-cap is illegal.",
  },

  // Tenant-policy restatements that only matter for affected users.
  {
    pattern: /^no pets allowed$/i,
    why: "Restates the pets filter; only matters to renters with pets.",
  },
  {
    pattern: /^no dss tenants?$/i,
    why: "Restates the DSS filter; only matters to renters on benefits.",
  },
  {
    pattern: /^(families|students)( and (pets|students))? not accepted$/i,
    why: "Restates the tenant-preferences filter.",
  },
  {
    pattern: /^restrictive tenant policy$/i,
    why: "Vague — without the specifics it's actionable advice the renter can't use.",
  },

  // Pending enrichment data — this means *we* haven't fetched the data
  // yet, not that the property has a problem. The Public records section
  // already surfaces 'pending' with a clearer label.
  {
    pattern: /^no epc rating (provided|available|disclosed)$/i,
    why: "EPC enrichment is async — 'pending' belongs in the public-records row, not as a property-level watchout.",
  },
  {
    pattern: /^no broadband (data|info|speed data)( available)?$/i,
    why: "Broadband enrichment is async — 'pending' isn't a property defect.",
  },

  // Typical minimum-term restatements. The mobile shell shows the
  // minimum term in the fineprint; only *unusually short* breaks (e.g.
  // 1-2 months) are a watchout.
  {
    pattern: /^(6|12)[- ]month minimum term$/i,
    why: "6- and 12-month minimums are the UK norm; only sub-6 break clauses are noteworthy.",
  },
  {
    pattern: /^minimum (6|12)[- ]month term$/i,
    why: "Same as above, alternative phrasing.",
  },

  // Borderline EPC alone (without compounding context).
  {
    pattern: /^epc (rating )?d( rating)?$/i,
    why: "EPC D is borderline-average; only flag when compounded with bills-not-included or other costs.",
  },

  // Generic data-gap watchouts.
  {
    pattern: /^deposit (amount )?(not stated|and fees not stated)$/i,
    why: "The listing portal omitted the deposit — it'll be in the agent pack; not a property defect.",
  },

  // Missing-appliance "watchouts" based on absence-of-mention. Agents
  // routinely omit standard white goods from listing copy; inferring a
  // defect from silence is unreliable and renters can verify in one
  // message to the agent.
  {
    pattern: /^no washer mentioned$/i,
    why: "Agents omit standard appliances; absence-of-mention isn't a defect.",
  },
  {
    pattern: /^no washing machine( mentioned)?$/i,
    why: "Same as above — most flats have one; missing mention isn't evidence.",
  },

  // Compounds that look ominous but combine an average fact with a
  // data gap. "EPC D with bills status unclear" pairs an average EPC
  // with the typical bills-excluded default — it's a speculative
  // worry, not a concrete issue. Compounds with hard facts on BOTH
  // sides (e.g. "EPC F + bills excluded") still slip through.
  {
    pattern: /with bills (status (unclear|not specified)|not mentioned)/i,
    why: "Compounding an EPC letter with a data gap doesn't surface an actual problem.",
  },
];

/**
 * Whether a given label is on the highlight denylist. Exposed so the
 * prompt-quality test can introspect what we'd drop without
 * re-implementing the matcher.
 */
export function isNoiseHighlight(label: string): boolean {
  const trimmed = label.trim();
  return NOISE_HIGHLIGHTS.some(({ pattern }) => pattern.test(trimmed));
}

export function isNoiseWatchout(label: string): boolean {
  const trimmed = label.trim();
  return NOISE_WATCHOUTS.some(({ pattern }) => pattern.test(trimmed));
}

/**
 * Labels the model uses when it thinks the deposit exceeds the Tenant
 * Fees Act cap (5 weeks' rent for annual rent under £50k). We verify
 * these arithmetically — Haiku has been observed to write
 * "Deposit above legal cap" with a self-contradicting detail field that
 * does the math wrong (e.g. dividing deposit by monthly rent and calling
 * the ratio "weeks"), then ship the alarm anyway because the structured
 * tool output commits label + severity before reasoning completes.
 */
const DEPOSIT_OVER_CAP_PATTERN =
  /^deposit (above|over|exceeds?|exceeding) (the )?(legal (cap|limit|maximum)|(5|five) weeks'? rent)$/i;

/**
 * Five weeks' rent — the Tenant Fees Act 2019 cap for annual rent under
 * £50k. Returns null when monthly rent is missing or non-positive, so
 * callers can distinguish "unknown" from "zero".
 */
export function computeFiveWeeksRent(
  priceMonthly: number | null | undefined
): number | null {
  if (
    priceMonthly == null ||
    !Number.isFinite(priceMonthly) ||
    priceMonthly <= 0
  ) {
    return null;
  }
  return (priceMonthly * 12 * 5) / 52;
}

/**
 * Side data filterFeatures uses to verify watchouts that make
 * deterministic claims about the listing (currently: deposit-over-cap).
 */
export type LegalChecks = {
  deposit?: number | null;
  priceMonthly?: number | null;
};

/**
 * True when a deposit-over-cap watchout label is *contradicted* by the
 * actual numbers. Uses ceil() on the cap so pence-over-cap rounding
 * (e.g. £2,308 deposit against £2,307.69 cap on £2,000 rent) reads as
 * "at cap" rather than a legal breach — matching how landlords and
 * Shelter treat sub-£1 overages in practice.
 */
function isFalseDepositOverCap(
  label: string,
  checks: LegalChecks | undefined
): boolean {
  if (!checks || !DEPOSIT_OVER_CAP_PATTERN.test(label.trim())) {
    return false;
  }
  const cap = computeFiveWeeksRent(checks.priceMonthly);
  if (cap == null || checks.deposit == null) {
    return false;
  }
  return checks.deposit <= Math.ceil(cap);
}

/**
 * Apply both denylists to a persisted Features blob. Items with empty
 * or whitespace-only labels are dropped too — they slip past the
 * Anthropic tool-input validator but render as visual gaps.
 *
 * Returns the input nullish value unchanged (null → null, undefined →
 * undefined) so callers can pass either the listing-detail (null) or
 * the review-card (undefined) shape without type juggling.
 */
export function filterFeatures(
  features: Features | null,
  checks?: LegalChecks
): Features | null;
export function filterFeatures(
  features: Features | undefined,
  checks?: LegalChecks
): Features | undefined;
export function filterFeatures(
  features: Features | null | undefined,
  checks?: LegalChecks
): Features | null | undefined;
export function filterFeatures(
  features: Features | null | undefined,
  checks?: LegalChecks
): Features | null | undefined {
  if (features == null) {
    return features;
  }
  // v1 enrichment rows predate the highlights/watchouts arrays —
  // they're persisted with only `summary` (or `smallPrint`). Guard
  // against the missing arrays so the read path can call this
  // unconditionally.
  return {
    summary: features.summary,
    highlights: Array.isArray(features.highlights)
      ? features.highlights.filter(keepHighlight)
      : [],
    watchouts: Array.isArray(features.watchouts)
      ? features.watchouts.filter((w) => keepWatchout(w, checks))
      : [],
  };
}

function keepHighlight(h: HighlightItem): boolean {
  const label = h.label?.trim() ?? "";
  if (!label) {
    return false;
  }
  return !isNoiseHighlight(label);
}

function keepWatchout(w: WatchoutItem, checks?: LegalChecks): boolean {
  const label = w.label?.trim() ?? "";
  if (!label) {
    return false;
  }
  if (isNoiseWatchout(label)) {
    return false;
  }
  if (isFalseDepositOverCap(label, checks)) {
    return false;
  }
  return true;
}
