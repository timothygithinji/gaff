/**
 * Sticky footer with the cost estimate + primary CTA.
 *
 * The left column shows "ESTIMATE · ~N listings / week"; the right is
 * the primary "Start watching" / "Save changes" CTA. Both update live
 * as the form state changes — the parent owns the numeric inputs and
 * passes them in here so this stays a pure presentation component.
 */
import { Button } from "../../components/ui/button";

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
    <div className="sticky right-0 bottom-0 left-0 z-10 mt-8 border-border border-t bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
            ESTIMATE
          </p>
          <p className="font-serif text-foreground text-lg">
            ~{listingsPerWeek.toLocaleString()} listings / week
          </p>
        </div>
        <Button
          className="rounded-full px-6"
          disabled={disabled || pending}
          onClick={onSubmit}
          size="lg"
          type="button"
        >
          {pending ? "Saving…" : ctaLabel}
        </Button>
      </div>
    </div>
  );
}
