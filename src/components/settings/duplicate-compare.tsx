/**
 * The merge-duplicates comparison — now the PRIMARY view of a suggestion
 * group, not an optional toggle. A terse one-line summary isn't enough to
 * confidently merge (or split) a 3-way group where only two are actually
 * the same home; you want to SEE the listings side by side and pick, per
 * column, which ones fold together.
 *
 * Each column carries a Keep / Merge / Skip selector (driven from the
 * parent card) above the listing facts: hero photo, price, address, beds,
 * portal + source link, EPC, and nearest-station walk. The selector header
 * paints immediately from the cheap summaries; the fact rows fill in once
 * the full `getListingDetail` for each cluster loads (lazily, reusing the
 * existing server function — no new endpoint).
 *
 * Fact rows that read identically across every column are tinted green
 * (strong "same home" signal); rows that differ are tinted amber so a
 * genuine mismatch jumps out before you merge.
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { listingDetailQueryOptions } from "../../lib/listing-detail-query";
import { cn } from "../../lib/utils";
import type { DuplicateClusterSummary } from "../../server/functions/clusters";
import type { ListingDetailPayload } from "../../server/functions/listing-detail";

/** Per-column merge role. Exactly one column in a group is "keep". */
export type MergeRole = "keep" | "merge" | "skip";

type Props = {
  clusters: DuplicateClusterSummary[];
  roleOf: (clusterId: string) => MergeRole;
  onSetRole: (clusterId: string, role: MergeRole) => void;
};

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
      return s.walkMinutes != null
        ? `${s.name} · ${s.walkMinutes}m walk`
        : s.name;
    },
  },
];

function priceLabel(n: number | null): string {
  return n == null ? "—" : `£${n.toLocaleString("en-GB")}`;
}

export function DuplicateCompare({ clusters, roleOf, onSetRole }: Props) {
  const results = useQueries({
    queries: clusters.map((c) => listingDetailQueryOptions(c.clusterId)),
  });

  const detail = results.map((r) =>
    r.data as ListingDetailPayload | undefined
  );
  const allLoaded = detail.every((d) => !!d);
  const anyError = results.some((r) => r.isError);

  return (
    <div
      className="mt-3 grid gap-3 rounded-md border border-line bg-ground/40 p-3"
      style={{ gridTemplateColumns: `repeat(${clusters.length}, minmax(0, 1fr))` }}
    >
      {/* Row 1 — selector header. Paints immediately from summaries. */}
      {clusters.map((c) => (
        <ColumnHeader
          cluster={c}
          key={`head-${c.clusterId}`}
          onSetRole={onSetRole}
          role={roleOf(c.clusterId)}
        />
      ))}

      {/* Row 2 — hero photo (once detail loads). */}
      {clusters.map((c, i) => (
        <Photo data={detail[i]} key={`photo-${c.clusterId}`} />
      ))}

      {anyError ? (
        <p
          className="col-span-full px-1 py-2 text-xs"
          style={{ color: "#b4472a" }}
        >
          Couldn't load one of the listings to compare.
        </p>
      ) : null}

      {/* Fact rows — tinting needs every column loaded, so hold until then. */}
      {allLoaded
        ? FIELDS.map((field) => {
            const loaded = detail as ListingDetailPayload[];
            const values = loaded.map((d) => field.value(d));
            const allSame = values.every((v) => v === values[0] && v !== "—");
            const anyDiffer = new Set(values).size > 1;
            return values.map((v, i) => (
              <FieldCell
                differ={anyDiffer}
                key={`${field.label}-${clusters[i]?.clusterId}`}
                label={field.label}
                same={allSame}
                value={v}
              />
            ));
          })
        : clusters.map((c) => (
            <p
              className="px-1 py-2 text-slate text-xs"
              key={`loading-${c.clusterId}`}
            >
              Loading…
            </p>
          ))}
    </div>
  );
}

const ROLES: { role: MergeRole; label: string }[] = [
  { role: "keep", label: "Keep" },
  { role: "merge", label: "Merge" },
  { role: "skip", label: "Skip" },
];

/** Fill for the currently-selected role button (maritime palette). */
function activeRoleClass(role: MergeRole): string {
  if (role === "keep") {
    return "bg-navy text-white";
  }
  if (role === "merge") {
    return "bg-copper text-white";
  }
  return "bg-slate/70 text-white";
}

function ColumnHeader({
  cluster,
  role,
  onSetRole,
}: {
  cluster: DuplicateClusterSummary;
  role: MergeRole;
  onSetRole: (clusterId: string, role: MergeRole) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-hidden rounded-md border border-line">
        {ROLES.map((r) => {
          const active = role === r.role;
          return (
            <button
              aria-pressed={active}
              className={cn(
                "flex-1 px-1.5 py-1 font-semibold text-[10px] uppercase tracking-[0.08em] transition-colors",
                active
                  ? activeRoleClass(r.role)
                  : "bg-white text-slate hover:bg-ground"
              )}
              key={r.role}
              onClick={() => onSetRole(cluster.clusterId, r.role)}
              type="button"
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="truncate font-medium text-[12px] text-navy">
          {cluster.headlineAddress || cluster.headlineTitle || cluster.clusterId}
        </span>
        <span className="text-[11px] text-slate">
          {priceLabel(cluster.priceMonthly)} ·{" "}
          {cluster.bedrooms == null ? "? bed" : `${cluster.bedrooms} bed`} ·{" "}
          {cluster.portals.join(", ")}
        </span>
      </div>
    </div>
  );
}

function Photo({ data }: { data: ListingDetailPayload | undefined }) {
  if (!data) {
    return <div className="h-36 w-full rounded-md bg-mist" />;
  }
  const { photos } = data;
  return (
    <div className="flex flex-col gap-1.5">
      {photos.length > 0 ? (
        // Horizontal snap-scroll strip of EVERY photo (pooled across
        // portals server-side) so you can actually eyeball whether the two
        // columns are the same home, not just compare hero shots.
        <div className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto rounded-md">
          {photos.map((p, i) => (
            // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
            <img
              alt={`${data.headline.addressRaw} — ${i + 1} of ${photos.length}`}
              className="h-36 w-full shrink-0 snap-start rounded-md object-cover"
              key={p.r2Key ?? p.url}
              loading="lazy"
              src={p.url}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-36 w-full items-center justify-center rounded-md bg-mist">
          <span className="text-[10px] text-slate">No photo</span>
        </div>
      )}
      {photos.length > 1 ? (
        <span className="text-[10px] text-slate">
          {photos.length} photos · scroll →
        </span>
      ) : null}
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
