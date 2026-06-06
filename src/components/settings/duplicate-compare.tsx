/**
 * Inline "are these the same home?" comparison for the merge-duplicates
 * tool. The terse one-line summaries on the suggestion card aren't enough
 * to confidently merge (or reject) a pair — you want to SEE the two
 * listings. This pulls the full `getListingDetail` for each cluster in the
 * group (lazily — only once the user expands the comparison) and lays the
 * decision-changing facts out in aligned columns: hero photo, price,
 * address, beds, portal + source link, EPC, and nearest-station walk.
 *
 * Rows that read identically across every column are tinted green (strong
 * "same home" signal); rows that differ are tinted amber so a genuine
 * mismatch jumps out before you merge. Reuses the existing
 * `getListingDetail` server function — no new endpoint.
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { queryKeys } from "../../lib/query-keys";
import { cn } from "../../lib/utils";
import {
  type ListingDetailPayload,
  getListingDetail,
} from "../../server/functions/listing-detail";

type Props = { clusterIds: string[] };

/** One comparable field, pulled from a listing-detail payload. */
type Field = {
  label: string;
  /** Display string per cluster. */
  value: (d: ListingDetailPayload) => string;
};

const FIELDS: Field[] = [
  {
    label: "Price",
    value: (d) =>
      d.headline.priceMonthly != null
        ? `£${d.headline.priceMonthly.toLocaleString("en-GB")}/mo`
        : "—",
  },
  { label: "Address", value: (d) => d.headline.addressRaw || "—" },
  {
    label: "Beds",
    value: (d) =>
      d.headline.bedrooms != null ? `${d.headline.bedrooms} bed` : "—",
  },
  { label: "Portal", value: (d) => d.headline.portal || "—" },
  { label: "EPC", value: (d) => d.epc?.rating ?? "Pending" },
  {
    label: "Nearest station",
    value: (d) => {
      const s = d.stationRoutes?.[0];
      if (!s) {
        return "—";
      }
      return s.walkMinutes != null ? `${s.name} · ${s.walkMinutes}m walk` : s.name;
    },
  },
];

export function DuplicateCompare({ clusterIds }: Props) {
  const results = useQueries({
    queries: clusterIds.map((id) => ({
      queryKey: queryKeys.listingDetail(id),
      queryFn: () => getListingDetail({ data: { clusterId: id } }),
      staleTime: 15_000,
    })),
  });

  if (results.some((r) => r.isLoading)) {
    return (
      <p className="px-1 py-3 text-slate text-xs">Loading both listings…</p>
    );
  }
  if (results.some((r) => r.isError)) {
    return (
      <p className="px-1 py-3 text-xs" style={{ color: "#b4472a" }}>
        Couldn't load one of the listings to compare.
      </p>
    );
  }

  const data = results.map((r) => r.data).filter((d): d is ListingDetailPayload => !!d);
  if (data.length < 2) {
    return null;
  }

  return (
    <div
      className="mt-3 grid gap-3 rounded-md border border-line bg-ground/40 p-3"
      style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
    >
      {data.map((d, i) => (
        <Photo data={d} key={`photo-${clusterIds[i]}`} />
      ))}
      {FIELDS.map((field) => {
        const values = data.map((d) => field.value(d));
        const allSame = values.every((v) => v === values[0] && v !== "—");
        const anyDiffer = new Set(values).size > 1;
        return values.map((v, i) => (
          <FieldCell
            differ={anyDiffer}
            key={`${field.label}-${clusterIds[i]}`}
            label={field.label}
            same={allSame}
            value={v}
          />
        ));
      })}
    </div>
  );
}

function Photo({ data }: { data: ListingDetailPayload }) {
  const hero = data.photos[0];
  return (
    <div className="flex flex-col gap-1.5">
      {hero ? (
        // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
        <img
          alt={data.headline.addressRaw}
          className="h-24 w-full rounded-md object-cover"
          src={hero.url}
        />
      ) : (
        <div className="flex h-24 w-full items-center justify-center rounded-md bg-mist">
          <span className="text-[10px] text-slate">No photo</span>
        </div>
      )}
      <Link
        className="truncate text-[11px] text-copper hover:underline"
        params={{ clusterId: data.cluster.id }}
        search={{ from: "compare" }}
        to="/listings/$clusterId"
      >
        Open full listing →
      </Link>
    </div>
  );
}

function FieldCell({
  label,
  value,
  same,
  differ,
}: {
  label: string;
  value: ReactNode;
  same: boolean;
  differ: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-sm px-2 py-1.5",
        same && "bg-[#5D7A4A]/12",
        differ && "bg-[#B26B3F]/12"
      )}
    >
      <span className="font-semibold text-[9px] text-slate uppercase tracking-[0.1em]">
        {label}
      </span>
      <span className="break-words text-[12px] text-navy leading-snug">
        {value}
      </span>
    </div>
  );
}
