/**
 * Compact list row used for "Other mutual picks" on the Shortlist
 * screen and for the full `/matches` list view.
 *
 * Row shape: 84×84 thumbnail · address + price · outcode · "both kept ·
 * age" with avatar stack. Tappable; navigates to `/listings/$clusterId`
 * via the provided `onOpen` handler.
 */
import type { MutualMatch } from "../../server/functions/shortlist";
import { CompactAvatarStack } from "./mutual-badge";

type Props = {
  match: MutualMatch;
  /** Pre-formatted age (e.g. "yesterday") for the row footer. */
  ageLabel: string;
  /** How many members are in the household — drives the "both / all N" copy. */
  memberCount: number;
  onOpen: () => void;
};

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function outcodeOf(postcode: string | null): string {
  if (!postcode) {
    return "";
  }
  const trimmed = postcode.trim().toUpperCase();
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

function bedBathSummary(beds: number | null, baths: number | null): string {
  const parts: string[] = [];
  if (beds !== null) {
    parts.push(`${beds} bed`);
  }
  if (baths !== null) {
    parts.push(`${baths} bath`);
  }
  return parts.join(" · ");
}

export function MatchRow({ match, ageLabel, memberCount, onOpen }: Props) {
  const { headline, members } = match;
  const outcode = outcodeOf(headline.postcode);
  const bedBath = bedBathSummary(headline.bedrooms, headline.bathrooms);
  let keptLabel = "Kept";
  if (memberCount === 2) {
    keptLabel = "Both kept";
  } else if (memberCount > 2) {
    keptLabel = `All ${memberCount} kept`;
  }

  return (
    <button
      className="flex w-full gap-3.5 rounded-md border border-line bg-card p-3 text-left"
      onClick={onOpen}
      type="button"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-mist">
        {headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start, not Next.js — R2 URLs are cache-tagged.
          <img
            alt={headline.addressRaw}
            className="h-full w-full object-cover"
            src={headline.photoUrl}
          />
        ) : null}
      </div>
      <div className="flex min-w-0 grow basis-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="line-clamp-1 font-semibold text-[15px] text-navy leading-[18px]">
            {headline.addressRaw}
          </span>
          <span className="shrink-0 font-semibold text-[15px] text-navy">
            {formatPrice(headline.priceMonthly)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {outcode ? (
            <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
              {outcode}
            </span>
          ) : null}
          {outcode && bedBath ? (
            <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-border" />
          ) : null}
          {bedBath ? (
            <span className="text-[11px] text-muted-foreground">{bedBath}</span>
          ) : null}
        </div>
        {memberCount > 1 ? (
          <div className="mt-0.5 flex items-center gap-1.5">
            <CompactAvatarStack members={members} />
            <span className="font-semibold text-[11px] text-muted-foreground">
              {keptLabel} · {ageLabel}
            </span>
          </div>
        ) : (
          <span className="font-semibold text-[11px] text-muted-foreground">
            {keptLabel} · {ageLabel}
          </span>
        )}
      </div>
    </button>
  );
}
