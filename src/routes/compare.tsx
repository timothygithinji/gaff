/**
 * `/compare?a=<clusterId>&b=<clusterId>` — side-by-side compare.
 *
 * A 2-person household running a blind-veto shortlist tends to end up
 * with 4–8 mutually-shortlisted properties. Picking between them means
 * tabbing through full listing detail pages, holding photos / costs /
 * commute / EPC in your head. This page strips the listing
 * detail down to the decision-changing fields and renders two listings
 * in a single view, so the comparison happens visually rather than in
 * your head.
 *
 * Two `useSuspenseQuery` calls run in parallel against the existing
 * `getListingDetail` server function — no new endpoint. The
 * `CompareColumn` component then renders each payload compactly.
 *
 * Layout:
 *   - Desktop (lg+): two columns inside the standard `AdminSidebar`
 *     shell — A on the left, B on the right.
 *   - Mobile (<lg): single column with a tabbed switcher at the top
 *     so the user can A/B without infinite scrolling.
 *
 * URL design — `?a=` and `?b=` are bare cluster IDs. Either missing
 * sends the user to /shortlist to pick a pair; same cluster on both
 * sides renders normally (degenerate but harmless).
 */

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CompareColumn } from "../components/compare/compare-column";
import { AdminSidebar } from "../components/layout/admin-sidebar";
import { Button } from "../components/ui/button";
import { requireSession } from "../lib/auth-guard";
import { listingDetailQueryOptions } from "../lib/listing-detail-query";
import type { getListingDetail } from "../server/functions/listing-detail";

const compareSearchSchema = z.object({
  a: z.string().min(1).optional(),
  b: z.string().min(1).optional(),
});

export const Route = createFileRoute("/compare")({
  head: () => ({ meta: [{ title: "Compare · Gaff" }] }),
  validateSearch: compareSearchSchema,
  beforeLoad: ({ context }) => {
    requireSession(
      context as { currentUserId: string | null },
      "/compare"
    );
  },
  loaderDeps: ({ search }) => ({ a: search.a, b: search.b }),
  loader: async ({ context, deps }) => {
    if (deps.a) {
      await context.queryClient.ensureQueryData(listingDetailQueryOptions(deps.a));
    }
    if (deps.b) {
      await context.queryClient.ensureQueryData(listingDetailQueryOptions(deps.b));
    }
  },
  component: ComparePage,
});

function ComparePage() {
  const { a, b } = Route.useSearch();
  if (!(a && b)) {
    return <PickAPairPrompt missingA={!a} missingB={!b} />;
  }
  return <CompareBody clusterAId={a} clusterBId={b} />;
}

function CompareBody({
  clusterAId,
  clusterBId,
}: {
  clusterAId: string;
  clusterBId: string;
}) {
  const navigate = useNavigate();
  const { data: a } = useSuspenseQuery(listingDetailQueryOptions(clusterAId));
  const { data: b } = useSuspenseQuery(listingDetailQueryOptions(clusterBId));

  return (
    <>
      {/* Desktop shell with sidebar — two-column compare. */}
      <AdminSidebar mode="desktop-only">
        <header className="flex items-end justify-between gap-4 px-6 pt-9 pb-6 lg:px-10">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
              Side by side
            </span>
            <h1 className="font-serif text-[40px] text-foreground leading-[44px] tracking-tight">
              Compare
            </h1>
          </div>
          <Button onClick={() => navigate({ to: "/shortlist" })} size="sm" variant="ghost">
            Back to Shortlist
          </Button>
        </header>
        <div className="grid grid-cols-2 gap-6 px-6 pb-12 lg:px-10">
          <CompareColumn data={a} side="A" />
          <CompareColumn data={b} side="B" />
        </div>
      </AdminSidebar>

      {/* Mobile shell — tab between the two listings. */}
      <MobileCompare aData={a} bData={b} />
    </>
  );
}

function MobileCompare({
  aData,
  bData,
}: {
  aData: Awaited<ReturnType<typeof getListingDetail>>;
  bData: Awaited<ReturnType<typeof getListingDetail>>;
}) {
  const [active, setActive] = useState<"a" | "b">("a");
  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-16 sm:max-w-2xl lg:hidden">
      <header className="flex flex-col gap-3 px-6 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-[28px] text-foreground tracking-tight">
            Compare
          </h1>
          <Link
            className="text-[12px] text-primary hover:underline"
            to="/shortlist"
          >
            Shortlist
          </Link>
        </div>
        <div className="flex gap-2" role="tablist">
          <TabButton
            active={active === "a"}
            label="A"
            onClick={() => setActive("a")}
          />
          <TabButton
            active={active === "b"}
            label="B"
            onClick={() => setActive("b")}
          />
        </div>
      </header>
      <div className="flex flex-col gap-3.5 px-4 pt-3">
        {active === "a" ? (
          <CompareColumn data={aData} side="A" />
        ) : (
          <CompareColumn data={bData} side="B" />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    // biome-ignore lint/nursery/useAriaPropsSupportedByRole: aria-selected IS supported on role="tab" per the WAI-ARIA spec (https://www.w3.org/TR/wai-aria-1.2/#tab) — biome's check seems to look at the native `button` element's implicit role rather than the explicit role override.
    <button
      aria-selected={active}
      className={`flex-1 rounded-full px-4 py-2 text-center font-medium text-sm transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-border bg-card text-foreground"
      }`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

/**
 * Friendly empty state when the user lands on `/compare` without
 * picking two listings first. Points them back to Shortlist where the
 * pair-selector lives.
 */
function PickAPairPrompt({
  missingA,
  missingB,
}: {
  missingA: boolean;
  missingB: boolean;
}) {
  const message =
    missingA && missingB
      ? "Pick two listings from your shortlist to compare them side-by-side."
      : "Pick a second listing to compare with.";
  return (
    <>
      <AdminSidebar mode="desktop-only">
        <div className="flex flex-1 items-center justify-center px-10">
          <PickAPairCard message={message} />
        </div>
      </AdminSidebar>
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-background lg:hidden">
        <PickAPairCard message={message} />
      </div>
    </>
  );
}

function PickAPairCard({ message }: { message: string }) {
  return (
    <article className="flex max-w-md flex-col gap-3 rounded-2xl border border-border bg-card px-6 py-6 text-center">
      <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
        Side by side
      </span>
      <h2 className="font-serif text-[22px] text-foreground">Compare two listings</h2>
      <p className="text-[13px] text-muted-foreground">{message}</p>
      <Link
        className="mt-1 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:opacity-90"
        to="/shortlist"
      >
        Go to Shortlist
      </Link>
    </article>
  );
}
