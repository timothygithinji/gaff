/**
 * Router-level fallbacks — the safety net behind every route.
 *
 * `DefaultPendingComponent` renders while a route loader is in flight
 * past the router's `defaultPendingMs` threshold; routes with a tailored,
 * page-shaped `pendingComponent` override it. `DefaultErrorComponent`
 * renders when a loader (or a `useSuspenseQuery` inside the route) throws.
 *
 * Both are intentionally chrome-less and centred so they're safe on any
 * route — including the ones that don't mount the app shell (auth, invite).
 * Data screens supply their own shell-aware skeletons.
 */
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";
import { Skeleton } from "../skeleton";

const PENDING_LINES = ["a", "b", "c"];

export function DefaultPendingComponent() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-background p-10"
    >
      <div className="flex w-full max-w-md flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="aspect-[16/10] w-full rounded-[8px]" />
        <div className="flex flex-col gap-2.5">
          {PENDING_LINES.map((id) => (
            <Skeleton className="h-4 w-full" key={id} />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DefaultErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-10">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-card px-8 py-8 text-center">
        <p className="font-semibold text-[10px] text-primary uppercase tracking-[0.14em]">
          Something went sideways
        </p>
        <h1 className="font-serif text-2xl text-foreground">
          Couldn't load this page
        </h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        <button
          className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
          onClick={() => router.invalidate()}
          type="button"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
