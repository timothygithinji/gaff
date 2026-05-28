import type { ListingMetaBadge } from "../../lib/listing-meta";

const PALETTE: Record<ListingMetaBadge["variant"], string> = {
  fresh: "border-primary/30 bg-primary/10 text-foreground",
  info: "border-muted-foreground/20 bg-muted/60 text-foreground",
  caution: "border-amber-500/40 bg-amber-500/10 text-foreground",
  problem: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function MetaBadges({ badges }: { badges: ListingMetaBadge[] }) {
  if (badges.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-[11px] ${PALETTE[b.variant]}`}
          key={b.key}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
