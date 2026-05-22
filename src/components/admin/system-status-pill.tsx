/**
 * Status pill for the admin header. v1 hardcodes "All systems live" +
 * green; v1.1 will wire `tone` to live signals (recent successful
 * scrape, recent successful AI run, zero failures last hour).
 */
type SystemStatusPillProps = {
  label?: string;
  tone?: "live" | "degraded" | "down";
};

const TONE_CLASS: Record<
  NonNullable<SystemStatusPillProps["tone"]>,
  { dot: string; text: string; bg: string }
> = {
  live: {
    dot: "bg-emerald-600",
    text: "text-emerald-700",
    bg: "bg-emerald-100",
  },
  degraded: {
    dot: "bg-primary",
    text: "text-primary",
    bg: "bg-primary/10",
  },
  down: {
    dot: "bg-destructive",
    text: "text-destructive",
    bg: "bg-destructive/10",
  },
};

export function SystemStatusPill({
  label = "All systems live",
  tone = "live",
}: SystemStatusPillProps) {
  const klass = TONE_CLASS[tone];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${klass.bg} ${klass.text}`}
    >
      <span className={`h-2 w-2 rounded-full ${klass.dot}`} />
      <span className="font-medium text-xs uppercase tracking-wide">
        {label}
      </span>
    </span>
  );
}
