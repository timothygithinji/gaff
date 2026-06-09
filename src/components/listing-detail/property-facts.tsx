/**
 * "Property facts" — statutory disclosures the portal published.
 *
 * Three independently-optional blocks rolled into one card so the page
 * doesn't grow extra empty sections for portals that don't expose any
 * of these fields (Zoopla, OpenRent):
 *
 *   - Material Information (heating / parking / garden / utilities /
 *     accessibility) — UK statutory disclosure Rightmove exposes as
 *     `features.<category>[]`.
 *   - Flood disclosure — landlord's personal yes/no on historic
 *     flooding, distinct from the area-level EA tile in the public
 *     records section.
 *   - Listed-building flag — has real implications (alterations,
 *     external aerials, satellite dishes restricted).
 *   - Agent extras: brochure PDF link, branch description (HTML — already
 *     escaped server-side by the parser; we render via dangerouslySet
 *     since the portal markup is curated copy), affiliations badges.
 *
 * The card renders only what's present. When everything is null the
 * caller already omits the section (the server returns
 * `propertyFacts === undefined`).
 */

import { htmlToPlainText } from "../../lib/html-text";
import type {
  ListingDetailAgentExtras,
  ListingDetailPropertyFacts,
} from "../../server/functions/listing-detail";
import { SectionLabel } from "./section-label";

type Props = {
  facts?: ListingDetailPropertyFacts;
  agent?: ListingDetailAgentExtras;
};

type Row = { label: string; value: string };

function materialInfoRows(
  mi: NonNullable<ListingDetailPropertyFacts["materialInfo"]> | null
): Row[] {
  if (!mi) {
    return [];
  }
  const rows: Row[] = [];
  if (mi.heating) {
    rows.push({ label: "Heating", value: mi.heating });
  }
  if (mi.parking) {
    rows.push({ label: "Parking", value: mi.parking });
  }
  if (mi.garden) {
    rows.push({ label: "Garden", value: mi.garden });
  }
  if (mi.electricity) {
    rows.push({ label: "Electricity", value: mi.electricity });
  }
  if (mi.water) {
    rows.push({ label: "Water", value: mi.water });
  }
  if (mi.sewerage) {
    rows.push({ label: "Sewerage", value: mi.sewerage });
  }
  if (mi.accessibility) {
    rows.push({ label: "Accessibility", value: mi.accessibility });
  }
  return rows;
}

function floodSummary(
  fd: NonNullable<ListingDetailPropertyFacts["floodDisclosure"]> | null
): { text: string; tone: "positive" | "warn" } | null {
  if (!fd) {
    return null;
  }
  if (fd.floodedInLastFiveYears === true) {
    const sources =
      fd.floodSources.length > 0 ? ` (${fd.floodSources.join(", ")})` : "";
    return {
      text: `Landlord disclosed historic flooding in the last 5 years${sources}.`,
      tone: "warn",
    };
  }
  if (fd.floodedInLastFiveYears === false) {
    return fd.floodDefences === true
      ? {
          text: "Not flooded in the last 5 years; defences present.",
          tone: "positive",
        }
      : { text: "Not flooded in the last 5 years.", tone: "positive" };
  }
  return null;
}

function PropertyFactsBody({ facts, agent }: Props) {
  const miRows = facts ? materialInfoRows(facts.materialInfo) : [];
  const flood = facts ? floodSummary(facts.floodDisclosure) : null;
  const listed = facts?.listedBuilding === true;

  return (
    <div className="flex flex-col gap-4">
      {miRows.length > 0 ? (
        <ul className="flex flex-col">
          {miRows.map((r, idx) => (
            <li
              className={`flex items-center py-2 ${idx < miRows.length - 1 ? "border-border border-b" : ""}`}
              key={r.label}
            >
              <span className="grow basis-0 text-[13px] text-muted-foreground">
                {r.label}
              </span>
              <span className="text-[13px] text-foreground">{r.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {flood ? (
        <p
          className={`text-[12px] leading-[140%] ${flood.tone === "warn" ? "text-warning-text" : "text-slate"}`}
        >
          {flood.text}
        </p>
      ) : null}

      {listed ? (
        <p className="text-[12px] text-warning-text leading-[140%]">
          Listed building — statutory restrictions on external alterations,
          satellite dishes, and aerials apply.
        </p>
      ) : null}

      {agent?.affiliations && agent.affiliations.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {agent.affiliations.map((a) => (
            <span
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              key={a}
            >
              {a}
            </span>
          ))}
        </div>
      ) : null}

      {agent?.descriptionHtml ? (
        <details className="text-[12px] text-muted-foreground">
          <summary className="cursor-pointer text-foreground">
            About the agent
          </summary>
          <p className="mt-2 max-h-48 overflow-auto whitespace-pre-line rounded-md bg-muted p-3 text-[12px] leading-[140%]">
            {htmlToPlainText(agent.descriptionHtml)}
          </p>
        </details>
      ) : null}
    </div>
  );
}

function hasAnything({ facts, agent }: Props): boolean {
  if (facts) {
    if (facts.materialInfo) {
      return true;
    }
    if (facts.floodDisclosure) {
      return true;
    }
    if (facts.listedBuilding === true) {
      return true;
    }
  }
  if (agent) {
    if (agent.descriptionHtml) {
      return true;
    }
    if (agent.affiliations.length > 0) {
      return true;
    }
  }
  return false;
}

/** Mobile shell — bare section, no card chrome. */
export function PropertyFacts(props: Props) {
  if (!hasAnything(props)) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3.5 px-5 pb-5">
      <SectionLabel>What the agent disclosed</SectionLabel>
      <div className="rounded-md border border-line bg-card p-4">
        <PropertyFactsBody {...props} />
      </div>
    </section>
  );
}

/** Desktop variant: single bordered card to match `<CostsCard>` etc. */
export function PropertyFactsCard(props: Props) {
  if (!hasAnything(props)) {
    return null;
  }
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-line bg-card p-6">
      <SectionLabel>What the agent disclosed</SectionLabel>
      <PropertyFactsBody {...props} />
    </article>
  );
}
