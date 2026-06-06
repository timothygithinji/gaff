/**
 * Reusable skeleton building blocks for route `pendingComponent`s.
 *
 * All of these compose the shadcn `Skeleton` primitive — page-level
 * skeletons mirror a screen's major regions (header, cards, list rows,
 * columns) so the layout doesn't reflow when real data lands. Keep the
 * shapes coarse: a skeleton's job is to hold the rhythm, not to be a
 * pixel-perfect ghost of the final UI.
 */
import { Skeleton } from "../skeleton";

/** Stable id arrays so repeated skeleton rows get non-index React keys. */
export function skeletonIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

/** Eyebrow + big title block — the header most screens lead with. */
export function SkeletonPageHeader({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-2 h-8 w-52" />
    </div>
  );
}

/** A bordered card with a photo banner + two text lines (search / match). */
export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-line bg-paper p-[18px]">
      <Skeleton className="aspect-[16/10] w-full rounded-[6px]" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

/** A horizontal list row: square thumb + two stacked text lines. */
export function SkeletonListRow() {
  return (
    <div className="flex items-stretch gap-3.5 rounded-lg border border-line bg-card p-3.5">
      <Skeleton className="size-[64px] shrink-0 rounded-md" />
      <div className="flex flex-1 flex-col gap-2 pt-1">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** A vertical stack of {@link SkeletonListRow}s. */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {skeletonIds("row", count).map((id) => (
        <SkeletonListRow key={id} />
      ))}
    </div>
  );
}

/** A column of label + input field skeletons, for form routes. */
export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="flex flex-col gap-5">
      {skeletonIds("field", fields).map((id) => (
        <div className="flex flex-col gap-2" key={id}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}
