/**
 * Sticky footer with the cost estimate + primary CTA.
 *
 * The left column shows "ESTIMATE · ~N listings / week"; the right is
 * the copper "Start watching" / "Save changes" CTA. Both update live
 * as the form state changes — the parent owns the numeric inputs and
 * passes them in here so this stays a pure presentation component.
 */

type Props = {
  listingsPerWeek: number;
  ctaLabel: string;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: () => void;
};

export function CostEstimate({
  listingsPerWeek,
  ctaLabel,
  disabled,
  pending,
  onSubmit,
}: Props) {
  return (
    <div className="sticky right-0 bottom-0 left-0 z-10 mt-8 border-brass/15 border-t bg-paper px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] text-brass uppercase tracking-[0.16em]">
            ESTIMATE
          </p>
          <p className="font-serif text-ink text-lg">
            ~{listingsPerWeek.toLocaleString()} listings / week
          </p>
        </div>
        <button
          className="rounded-full bg-copper px-6 py-3 font-medium text-bone text-sm disabled:opacity-50"
          disabled={disabled || pending}
          onClick={onSubmit}
          type="button"
        >
          {pending ? "Saving…" : ctaLabel}
        </button>
      </div>
    </div>
  );
}
