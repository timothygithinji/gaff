/**
 * `/deferred` — the parked-listings tray.
 *
 * A defer (from the Review screen) snoozes a half-filled listing for the
 * whole household until it re-scrapes and re-surfaces — see
 * `src/server/functions/deferrals.ts`. This page is the safety net so
 * deferred listings aren't a black hole: it lists everything currently
 * snoozed, when each comes back, whether the refresh scrape has run yet,
 * and lets you pull one back into the queue immediately ("Bring back").
 *
 * Layout mirrors `/settings/duplicates`: a centred maintenance column
 * inside the desktop shell, single column + bottom nav on mobile.
 */
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AdminSidebar } from "../components/layout/admin-sidebar";
import { BottomNav } from "../components/layout/bottom-nav";
import { Button } from "../components/ui/button";
import { requireSession } from "../lib/auth-guard";
import { deferralsQueryOptions } from "../lib/deferrals-query";
import {
  type DeferredItem,
  undeferCluster,
} from "../server/functions/deferrals";

export const Route = createFileRoute("/deferred")({
  head: () => ({ meta: [{ title: "Deferred · Gaff" }] }),
  beforeLoad: ({ context }) => {
    requireSession(context as { currentUserId: string | null }, "/deferred");
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(deferralsQueryOptions),
  component: DeferredPage,
});

function DeferredPage() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="mx-auto w-full max-w-[760px] px-8 py-10">
          <Header />
          <DeferredList />
        </div>
      </AdminSidebar>

      <div className="min-h-screen bg-ground pb-28 lg:hidden">
        <div className="mx-auto w-full max-w-[640px] px-5 pt-5 sm:px-8 sm:pt-8">
          <Link
            className="mb-5 flex items-center gap-3.5 text-slate text-sm transition-colors hover:text-navy"
            to="/"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.5} />
            Review
          </Link>
          <Header />
          <DeferredList />
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function Header() {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
        Parked
      </p>
      <h1 className="font-semibold text-[26px] text-navy leading-[100%] tracking-[-0.02em] lg:text-[36px]">
        Deferred listings
      </h1>
      <p className="mt-2 max-w-prose text-slate text-sm leading-relaxed">
        Listings you parked because they looked incomplete. Each re-scrapes
        for fresh info and slides back into Review on its own — or pull one
        back now.
      </p>
    </div>
  );
}

function DeferredList() {
  const { data, isLoading, isError } = useQuery(deferralsQueryOptions);

  if (isLoading) {
    return <p className="text-slate text-sm">Loading parked listings…</p>;
  }
  if (isError) {
    return (
      <p className="text-sm" style={{ color: "#b4472a" }}>
        Couldn't load deferred listings. Try again.
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white px-5 py-8 text-center">
        <p className="font-medium text-navy text-sm">Nothing deferred</p>
        <p className="mt-1 text-slate text-sm">
          Defer a listing from Review when it's too sparse to judge and it'll
          wait here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((item) => (
        <DeferredCard item={item} key={item.clusterId} />
      ))}
    </div>
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "back in 3 days" / "back tomorrow" / "due now" from an ISO deadline. */
function comesBackLabel(deferUntilIso: string): string {
  const ms = new Date(deferUntilIso).getTime() - Date.now();
  if (ms <= 0) {
    return "due now";
  }
  const days = Math.ceil(ms / MS_PER_DAY);
  if (days === 1) {
    return "back tomorrow";
  }
  return `back in ${days} days`;
}

function priceLabel(n: number | null): string {
  return n == null ? "—" : `£${n.toLocaleString()}`;
}

function DeferredCard({ item }: { item: DeferredItem }) {
  const qc = useQueryClient();
  const undefer = useMutation({
    mutationFn: () =>
      undeferCluster({ data: { clusterId: item.clusterId } }),
    onMutate: () => {
      qc.setQueryData(
        deferralsQueryOptions.queryKey,
        (prev?: DeferredItem[]) =>
          prev?.filter((d) => d.clusterId !== item.clusterId)
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["deferrals"] });
      // Bringing it back changes what's in the review queue.
      qc.invalidateQueries({ queryKey: ["review"] });
    },
  });

  return (
    <div className="flex items-stretch gap-3.5 rounded-lg border border-line bg-white p-3.5">
      <div className="size-[64px] shrink-0 overflow-hidden rounded-md bg-mist">
        {item.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start is not Next.js; <Image> isn't available.
          <img
            alt={item.headlineAddress}
            className="size-full object-cover"
            src={item.photoUrl}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[9px] text-slate">
            No photo
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          className="truncate font-medium text-navy text-sm hover:underline"
          params={{ clusterId: item.clusterId }}
          search={{ from: "review" }}
          to="/listings/$clusterId"
        >
          {item.headlineAddress || item.headlineTitle || item.clusterId}
        </Link>
        <span className="truncate text-slate text-xs">
          {priceLabel(item.priceMonthly)} ·{" "}
          {item.bedrooms == null ? "? bed" : `${item.bedrooms} bed`}
          {item.portals.length ? ` · ${item.portals.join(", ")}` : ""}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-mist px-2 py-0.5 font-medium text-slate">
            {comesBackLabel(item.deferUntil)}
          </span>
          <span className="text-slate/80">
            {item.rescrapedAt ? "refreshed" : "refresh pending"}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          disabled={undefer.isPending}
          onClick={() => undefer.mutate()}
          size="sm"
          variant="ghost"
        >
          {undefer.isPending ? "Bringing back…" : "Bring back"}
        </Button>
      </div>
    </div>
  );
}
