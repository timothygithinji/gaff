/**
 * Sticky footer with the primary CTA.
 *
 * Renders edge-to-edge inside the page inset so the button always sits
 * pinned to the bottom of the viewport while the form scrolls above it.
 */
import { Button } from "../../components/ui/button";

type Props = {
  ctaLabel: string;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: () => void;
};

export function CostEstimate({ ctaLabel, disabled, pending, onSubmit }: Props) {
  return (
    <div className="sticky right-0 bottom-0 left-0 z-10 mt-8 flex items-center justify-end border-border border-t bg-card px-6 py-3 lg:px-10">
      <Button
        className="rounded-full px-6"
        disabled={disabled}
        loading={pending}
        loadingText="Saving…"
        onClick={onSubmit}
        size="lg"
        type="button"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
