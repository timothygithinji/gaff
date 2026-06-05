/**
 * `/listings/$clusterId` — the Listing detail screen.
 *
 * Aggregates everything we know about one cluster into a single deep-
 * dive page. Loader pre-fetches the payload so SSR paints the real
 * content (not a skeleton); mutations are the standard swipe / undo
 * pair (re-used from Review semantics — the listing-detail screen is
 * just another surface for swiping).
 *
 * Sections (top → bottom, matching the Paper artboard):
 *
 *   1. Top bar — back / share / bookmark.
 *   2. Photo gallery.
 *   3. Price + "listed N days ago" + portals tracking.
 *   4. Address.
 *   5. Portal cross-listing card.
 *   6. "What we see" — floorplan analysis.
 *   7. "What's in the small print" — AI-extracted issues.
 *   8. "Where it sits" — map + commute card.
 *   9. "Public records" — EPC / broadband / amenities.
 *  10. Sticky bottom CTA bar.
 *
 * No bottom-nav on this screen — the sticky CTA + back button replace
 * it on the artboard.
 */
import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Loading03Icon,
  Share05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AdminSidebar } from "../../components/layout/admin-sidebar";
import { Costs } from "../../components/listing-detail/costs";
import { DesktopListingDetail } from "../../components/listing-detail/desktop-listing-detail";
import { DetailCta } from "../../components/listing-detail/detail-cta";
import { Fineprint } from "../../components/listing-detail/fineprint";
import { FloorplanAnalysis } from "../../components/listing-detail/floorplan-analysis";
import { Highlights } from "../../components/listing-detail/highlights";
import { PhotoGallery } from "../../components/listing-detail/photo-gallery";
import { PortalCrossList } from "../../components/listing-detail/portal-cross-list";
import { PropertyFacts } from "../../components/listing-detail/property-facts";
import { PublicRecords } from "../../components/listing-detail/public-records";
import { SmallPrint } from "../../components/listing-detail/small-print";
import { WhereItSits } from "../../components/listing-detail/where-it-sits";
import { PlacesAutocompleteInput } from "../../components/places-autocomplete-input";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import { requireSession } from "../../lib/auth-guard";
import { useHousehold } from "../../lib/household-context";
import {
  listingFromOriginSchema,
  resolveFromOrigin,
} from "../../lib/listing-origin";
import { queryKeys } from "../../lib/query-keys";
import {
  type ListingDetailPayload,
  getListingDetail,
  setClusterAddress,
} from "../../server/functions/listing-detail";
import { recordSwipe } from "../../server/functions/review";

// "keep" remains in the swipe_outcome DB enum but the UI no longer
// writes it (B1 collapsed Keep + Shortlist into one positive outcome).
// Existing rows still count as "kept" for mutual-match math.
type SwipeOutcome = "shortlist" | "skip";

const listingDetailQueryOptions = (clusterId: string) =>
  ({
    queryKey: queryKeys.listingDetail(clusterId),
    queryFn: () => getListingDetail({ data: { clusterId } }),
    // Swipes from other household members can change `partnerSwipes`
    // without a navigation; re-validate on focus.
    staleTime: 15_000,
  }) as const;

const listingDetailSearchSchema = z.object({
  from: listingFromOriginSchema,
});

export const Route = createFileRoute("/listings/$clusterId")({
  head: (ctx) => {
    const data = ctx.loaderData as ListingDetailPayload | undefined;
    return {
      meta: [
        {
          title: data?.headline.addressRaw
            ? `${data.headline.addressRaw} · Gaff`
            : "Listing · Gaff",
        },
      ],
    };
  },
  validateSearch: listingDetailSearchSchema,
  beforeLoad: ({ context, params }) => {
    requireSession(
      context as { currentUserId: string | null },
      `/listings/${params.clusterId}`
    );
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      listingDetailQueryOptions(params.clusterId)
    ),
  component: ListingDetailPage,
});

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function listedAgoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return "Listed today";
  }
  if (days === 1) {
    return "Listed yesterday";
  }
  if (days < 7) {
    return `Listed ${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  return `Listed ${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function shortAddressTitle(addressRaw: string): string {
  // Take the first comma-separated chunk — the design uses a short
  // street-level title (e.g. "Belsize Park Mews") rather than the full
  // postal address — then drop a leading house/flat number to match Paper.
  const idx = addressRaw.indexOf(",");
  const firstLine = idx === -1 ? addressRaw : addressRaw.slice(0, idx);
  return stripLeadingHouseNumber(firstLine.trim());
}

function stripLeadingHouseNumber(line: string): string {
  const stripped = line.replace(/^(flat|unit|apartment|apt)\s+\w+\s+/i, "");
  const withoutNumber = stripped.replace(/^\d+[a-z]?\s+/i, "");
  return withoutNumber.length > 0 ? withoutNumber : line;
}

function localityFromPostcode(postcode: string | null): string {
  if (!postcode) {
    return "";
  }
  return `London ${postcode.toUpperCase()}`;
}

const TRAILING_COMMA_RE = /,\s*$/;

function ListingDetailPage() {
  const { clusterId } = Route.useParams();
  const { from } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const queryOpts = listingDetailQueryOptions(clusterId);
  const { data } = useQuery(queryOpts);
  const { memberCount } = useHousehold();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<SwipeOutcome | null>(null);

  const swipe = useMutation({
    mutationFn: (args: { outcome: SwipeOutcome }) => {
      if (!data) {
        throw new Error("not_loaded");
      }
      return recordSwipe({
        data: {
          clusterId: data.cluster.id,
          searchId: data.searchId,
          outcome: args.outcome,
        },
      });
    },
    onMutate: async (args) => {
      setPendingAction(args.outcome);
      await qc.cancelQueries({ queryKey: queryOpts.queryKey });
      const previous = qc.getQueryData<ListingDetailPayload | null>(
        queryOpts.queryKey
      );
      if (previous) {
        qc.setQueryData<ListingDetailPayload>(queryOpts.queryKey, {
          ...previous,
          mySwipe: args.outcome,
        });
      }
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(queryOpts.queryKey, ctx.previous);
      }
      setError(e.message ?? "Couldn't record swipe");
    },
    onSettled: () => {
      setPendingAction(null);
      qc.invalidateQueries({ queryKey: queryOpts.queryKey });
      // Also invalidate the review queue + shortlist queries; this
      // listing now has a different presence in those feeds.
      qc.invalidateQueries({ queryKey: queryKeys.reviewNext() });
      qc.invalidateQueries({ queryKey: queryKeys.shortlist() });
    },
  });

  // Manual address override — lets the user pin the exact door (read off
  // the photos against Google Maps) so EPC resolves the precise cert
  // instead of a postcode estimate. The server re-fires enrich-epc.
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrValue, setAddrValue] = useState("");
  const setAddress = useMutation({
    mutationFn: (address: string) =>
      setClusterAddress({ data: { clusterId, address } }),
    onSuccess: () => {
      setAddrOpen(false);
      // enrich-epc re-fires server-side; its result lands async, so a
      // plain invalidate now picks up the refreshed EPC on the next read.
      qc.invalidateQueries({ queryKey: queryOpts.queryKey });
    },
    onError: (e: Error) => setError(e.message ?? "Couldn't save address"),
  });

  if (!data) {
    return <ListingDetailSkeleton />;
  }

  const {
    cluster,
    headline,
    portalSpread,
    photos,
    floorplan,
    summary,
    highlights,
    watchouts,
    fineprint,
    epc,
    commuteMinutes,
    stationRoutes,
    nearbyTransit,
    publicRecords,
    propertyFacts,
    agentExtras,
    mySwipe,
    partnerSwipes,
    googleMapsApiKey,
  } = data;

  const openAddressDialog = () => {
    setAddrValue(cluster.userAddress ?? headline.addressRaw);
    setAddrOpen(true);
  };

  const portalsTrackingLabel = `${portalSpread.length} portal${portalSpread.length === 1 ? "" : "s"} tracking`;
  const title = shortAddressTitle(headline.addressRaw);
  const locality = localityFromPostcode(headline.postcode ?? cluster.postcode);
  const whereTitle = headline.postcode
    ? `${title}, ${headline.postcode.split(" ")[0] ?? ""}`
        .trim()
        .replace(TRAILING_COMMA_RE, "")
    : title;

  return (
    <>
      {error ? (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-md bg-foreground px-4 py-3 text-primary-foreground text-sm shadow-lg"
        >
          {error}
        </div>
      ) : null}

      <DesktopListingDetail
        data={data}
        disabled={swipe.isPending}
        from={from}
        onEditAddress={openAddressDialog}
        onShortlist={() => swipe.mutate({ outcome: "shortlist" })}
        onSkip={() => swipe.mutate({ outcome: "skip" })}
        pendingAction={pendingAction}
      />

      <div className="mx-auto min-h-screen max-w-md bg-background pb-32 sm:max-w-2xl lg:hidden">
        {/* Top bar — Paper: 36px circular hairline buttons, px-5 */}
        <header className="flex items-center justify-between px-5 pt-2 pb-[18px]">
          <button
            aria-label="Back"
            className="flex size-9 items-center justify-center rounded-full border border-line bg-card text-foreground"
            onClick={() => {
              // Prefer real back navigation; fall back to wherever the
              // user came from (`?from=` search param).
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: resolveFromOrigin(from).path });
              }
            }}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2">
            <button
              aria-label="Share"
              className="flex size-9 items-center justify-center rounded-full border border-line bg-card text-foreground"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.share) {
                  navigator
                    .share({
                      title: headline.addressRaw,
                      url: headline.url,
                    })
                    .catch(() => {
                      // user cancelled
                    });
                }
              }}
              type="button"
            >
              <HugeiconsIcon icon={Share05Icon} size={16} strokeWidth={1.6} />
            </button>
            <button
              aria-busy={pendingAction === "shortlist" || undefined}
              aria-label="Bookmark"
              className={`flex size-9 items-center justify-center rounded-full border border-line bg-card disabled:opacity-50 ${
                mySwipe === "shortlist" ? "text-copper" : "text-foreground"
              }`}
              disabled={swipe.isPending}
              onClick={() => swipe.mutate({ outcome: "shortlist" })}
              type="button"
            >
              <HugeiconsIcon
                className={
                  pendingAction === "shortlist" ? "animate-spin" : undefined
                }
                icon={
                  pendingAction === "shortlist" ? Loading03Icon : Bookmark01Icon
                }
                size={16}
                strokeWidth={1.8}
              />
            </button>
          </div>
        </header>

        {/* Photo gallery */}
        <PhotoGallery alt={headline.addressRaw} photos={photos} />

        {/* Header block — Paper: eyebrow, then title-left / price-right */}
        <section className="flex flex-col gap-1.5 px-5 pt-[22px] pb-4">
          <span className="font-normal text-[10px] text-slate uppercase leading-3 tracking-[0.14em]">
            {listedAgoLabel(headline.firstSeenAt)} · {portalsTrackingLabel}
          </span>
          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate font-semibold text-[26px] text-foreground leading-7 tracking-[-0.02em]">
                {title}
              </h1>
              {locality ? (
                <p className="text-[12px] text-slate leading-4">{locality}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="font-light text-[26px] text-foreground leading-[26px] tracking-[-0.02em]">
                {formatPrice(headline.priceMonthly)}
              </span>
              <span className="text-[10px] text-slate leading-3">per month</span>
            </div>
          </div>
          <button
            className="mt-1 self-start text-[12px] text-copper underline-offset-2 hover:underline"
            onClick={openAddressDialog}
            type="button"
          >
            {cluster.userAddress
              ? "Edit pinned address"
              : "Fix address for exact EPC"}
          </button>
        </section>

        {/* Portal cross-list */}
        <PortalCrossList portals={portalSpread} />

        {/* "What stands out" — AI highlights + one-line summary */}
        <Highlights items={highlights} summary={summary} />

        {/* "What's in the small print" — AI watch-outs */}
        <SmallPrint items={watchouts} />

        {/* Consolidated costs — rent + council tax + service charge +
            amortised deposit, with bills as an indicator. */}
        <Costs fineprint={fineprint} priceMonthly={headline.priceMonthly} />

        {/* Floor plan — image only, no AI room-slot fakery */}
        <FloorplanAnalysis
          floorplan={floorplan}
          sizeSqFt={fineprint.sizeSqFt}
        />

        {/* "Where it sits" — map + commute */}
        <WhereItSits
          apiKey={googleMapsApiKey}
          commuteMinutes={commuteMinutes}
          lat={cluster.lat}
          lng={cluster.lng}
          nearbyTransit={nearbyTransit}
          stationRoutes={stationRoutes}
          title={whereTitle || "Where it sits"}
        />

        {/* "Public records" */}
        <PublicRecords epc={epc} publicRecords={publicRecords} />

        {/* Material info + flood/listed disclosures + agent extras */}
        <PropertyFacts agent={agentExtras} facts={propertyFacts} />

        {/* Tenancy terms / agent contact / fees disclosure */}
        <Fineprint fineprint={fineprint} />

        {/* Sticky bottom CTA */}
        <DetailCta
          disabled={swipe.isPending}
          memberCount={memberCount}
          mySwipe={mySwipe}
          onShortlist={() => swipe.mutate({ outcome: "shortlist" })}
          onSkip={() => swipe.mutate({ outcome: "skip" })}
          partnerSwipes={partnerSwipes}
          pendingAction={pendingAction}
        />
      </div>

      <Dialog onOpenChange={setAddrOpen} open={addrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pin the exact address</DialogTitle>
            <DialogDescription>
              Search the exact building for its real EPC, not a postcode
              estimate.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (addrValue.trim().length > 0) {
                setAddress.mutate(addrValue.trim());
              }
            }}
          >
            <div className="space-y-2">
              {cluster.userAddress ? (
                <p className="text-muted-foreground text-xs">
                  Current:{" "}
                  <span className="text-foreground">{cluster.userAddress}</span>
                </p>
              ) : null}
              <PlacesAutocompleteInput
                onSelect={({ formattedAddress }) =>
                  setAddrValue(formattedAddress)
                }
              />
              {addrValue ? (
                <p className="text-muted-foreground text-xs">
                  Selected: <span className="text-foreground">{addrValue}</span>
                </p>
              ) : null}
            </div>
            <DialogFooter className="mt-4">
              {cluster.userAddress ? (
                <Button
                  disabled={setAddress.isPending}
                  onClick={() => setAddress.mutate("")}
                  type="button"
                  variant="ghost"
                >
                  Clear override
                </Button>
              ) : null}
              <Button
                disabled={addrValue.trim().length === 0}
                loading={setAddress.isPending}
                type="submit"
              >
                Re-check EPC
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const SKELETON_PORTAL_ROWS = ["p0", "p1"];
const SKELETON_RECORDS_ROWS = ["r0", "r1", "r2", "r3"];

/**
 * Skeleton shown if the route component mounts before the loader has
 * hydrated `getListingDetail`. With `ensureQueryData` this is rare, but
 * a filter switch or a cold client navigation can land here briefly —
 * a proper skeleton beats the previous half-line animate-pulse stub.
 */
function ListingDetailSkeleton() {
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex min-w-0 flex-1 gap-6 px-10 pt-6 pb-8">
          <section className="flex w-[420px] shrink-0 flex-col gap-3.5">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <div className="flex gap-2">
              {SKELETON_PORTAL_ROWS.map((id) => (
                <Skeleton className="h-16 flex-1 rounded-xl" key={id} />
              ))}
            </div>
          </section>
          <section className="flex min-w-0 flex-1 flex-col gap-3.5">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </section>
        </div>
      </AdminSidebar>
      <div className="mx-auto min-h-screen max-w-md bg-background pb-32 sm:max-w-2xl lg:hidden">
        <header className="flex items-center justify-between px-4 pt-2 pb-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex gap-2.5">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        </header>
        <Skeleton className="mx-4 aspect-[4/5] rounded-2xl" />
        <section className="space-y-3 px-6 pt-6">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </section>
        <section className="space-y-3 px-4 pt-6">
          {SKELETON_RECORDS_ROWS.map((id) => (
            <Skeleton className="h-20 w-full rounded-2xl" key={id} />
          ))}
        </section>
      </div>
    </>
  );
}
