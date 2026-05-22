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
  live: { dot: "bg-[#7A8C5C]", text: "text-[#3F4A2F]", bg: "bg-[#7A8C5C]/12" },
  degraded: {
    dot: "bg-copper",
    text: "text-copper",
    bg: "bg-copper/10",
  },
  down: {
    dot: "bg-[#B05A38]",
    text: "text-[#B05A38]",
    bg: "bg-[#B05A38]/10",
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
