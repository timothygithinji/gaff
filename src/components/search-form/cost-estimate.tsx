/**
 * Submit affordance for the mobile search form.
 *
 *   - `CostEstimateBar` — the mobile sticky footer: an ESTIMATE eyebrow
 *     + "~N listings / week" on the left, a navy "Start watching" pill on
 *     the right. Pinned to the bottom of the viewport.
 *
 * Desktop has no equivalent card — its primary CTA lives up in the
 * breadcrumb header (see `DesktopSearchCreate`).
 *
 * The listings/week figure is a rough heuristic (outcodes × portals);
 * there's no server-side listings forecaster, so it's a directional hint
 * only — see the report note.
 */
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type BarProps = {
  ctaLabel: string;
  listingsPerWeek: number;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: () => void;
};

export function CostEstimateBar({
  ctaLabel,
  listingsPerWeek,
  disabled,
  pending,
  onSubmit,
}: BarProps) {
  return (
    <div className="sticky right-0 bottom-0 left-0 z-10 mx-auto flex max-w-md items-center justify-between border-line border-t bg-ground/95 px-5 pt-4 pb-7 backdrop-blur sm:max-w-2xl">
      <div className="flex flex-col gap-px">
        <span className="text-[10px] text-slate uppercase tracking-[0.12em]">
          Estimate
        </span>
        <span className="font-medium text-[13px] text-navy leading-4">
          ~{listingsPerWeek} listings / week
        </span>
      </div>
      <button
        className='inline-flex items-center gap-1.5 rounded-full bg-navy px-5.5 py-3.5 font-medium text-[#eef1f4] text-[13px] disabled:opacity-50'
        disabled={disabled || pending}
        onClick={onSubmit}
        type="button"
      >
        {pending ? (
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={14}
            strokeWidth={2}
          />
        ) : null}
        {pending ? "Saving…" : ctaLabel}
      </button>
    </div>
  );
}

