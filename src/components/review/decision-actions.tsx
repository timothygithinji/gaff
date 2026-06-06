/**
 * The review decision dock, shared by both device trees over one action set:
 * Keep · Skip · Undo + Details. `orientation` flips the whole layout:
 *
 *   - `vertical` (desktop): navy Keep button, then two 2-up outline rows
 *     (Skip·Details, Undo·Defer), with K/X/I/Z/D keycap hints. Defer is a
 *     desktop-only extra (snooze a half-filled listing).
 *   - `horizontal` (mobile): Undo·Skip·Details circles + a flex Keep pill,
 *     thumb-sized, no keycaps (no physical keyboard).
 *
 * Partner-aware Keep copy ("Keep · waiting on <initial>") comes from the
 * household context — the blind-veto rule lets us say a partner is pending,
 * never their verdict. Fixed-navy/`#eef1f4` surfaces pin literal hex so they
 * don't invert in the dark scene.
 */
import {
  Cancel01Icon,
  Clock01Icon,
  InformationCircleIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useHouseholdOptional } from "../../lib/household-context";
import { cn } from "../../lib/utils";
import { DeferMenu } from "./defer-menu";

export type DecisionPendingAction =
  | "shortlist"
  | "skip"
  | "undo"
  | "defer"
  | null;

type Props = {
  orientation: "vertical" | "horizontal";
  onShortlist?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
  onOpenDetail?: () => void;
  /** Desktop-only snooze; omit to hide the Defer affordance. */
  onDefer?: (days: number) => void;
  pendingAction?: DecisionPendingAction;
  disabled?: boolean;
};

function useKeepLabel(): string {
  const household = useHouseholdOptional();
  const partner = household?.otherMembers[0];
  const initial = partner
    ? (partner.name || partner.email || "?").charAt(0).toUpperCase()
    : null;
  return initial ? `Keep · waiting on ${initial}` : "Keep";
}

export function DecisionActions(props: Props) {
  const keepLabel = useKeepLabel();
  if (props.orientation === "vertical") {
    return <VerticalDock {...props} keepLabel={keepLabel} />;
  }
  return <HorizontalDock {...props} keepLabel={keepLabel} />;
}

/* ---------------- Desktop ---------------- */

function VerticalDock({
  onShortlist,
  onSkip,
  onUndo,
  onOpenDetail,
  onDefer,
  pendingAction = null,
  disabled,
  keepLabel,
}: Props & { keepLabel: string }) {
  const keepInert = !onShortlist || disabled;
  return (
    <div className="flex flex-col gap-2">
      <button
        aria-busy={pendingAction === "shortlist" || undefined}
        className={cn(
          "flex items-center justify-center gap-2.5 rounded-[6px] bg-[#0e2235] p-4 font-medium text-[#eef1f4] text-[13px] transition-opacity",
          keepInert
            ? "cursor-not-allowed opacity-40"
            : "hover:opacity-90 active:scale-[0.99]"
        )}
        disabled={keepInert}
        onClick={onShortlist}
        type="button"
      >
        {pendingAction === "shortlist" ? (
          <HugeiconsIcon
            className="animate-spin text-copper"
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
          />
        ) : (
          <HeartFilledGlyph />
        )}
        <span>{keepLabel}</span>
        <ActionKbd onDark>K</ActionKbd>
      </button>
      <div className="flex gap-2">
        <OutlineAction
          disabled={disabled}
          glyph={<HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} />}
          hint="X"
          label="Skip"
          loading={pendingAction === "skip"}
          onClick={onSkip}
        />
        <OutlineAction
          glyph={
            <HugeiconsIcon
              icon={InformationCircleIcon}
              size={14}
              strokeWidth={1.8}
            />
          }
          hint="I"
          label="Details"
          onClick={onOpenDetail}
        />
      </div>
      <div className="flex gap-2">
        <OutlineAction
          disabled={disabled}
          glyph={<ArrowBackGlyph size={14} />}
          hint="Z"
          label="Undo"
          loading={pendingAction === "undo"}
          onClick={onUndo}
        />
        {onDefer ? (
          <DeferMenu
            onDefer={onDefer}
            side="top"
            trigger={
              <button
                aria-busy={pendingAction === "defer" || undefined}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-[6px] border border-line bg-paper p-3.5 text-[12px] text-navy transition-opacity",
                  disabled
                    ? "cursor-not-allowed opacity-40"
                    : "hover:opacity-90 active:scale-[0.99]"
                )}
                disabled={disabled}
                type="button"
              >
                <HugeiconsIcon
                  className={pendingAction === "defer" ? "animate-spin" : undefined}
                  icon={pendingAction === "defer" ? Loading03Icon : Clock01Icon}
                  size={14}
                  strokeWidth={1.8}
                />
                <span>Defer</span>
                <ActionKbd>D</ActionKbd>
              </button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}

/** Outline secondary action (Skip / Details / Undo) — even two-up cells. */
function OutlineAction({
  glyph,
  label,
  hint,
  onClick,
  disabled,
  loading = false,
}: {
  glyph: ReactNode;
  label: string;
  hint: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inert = !onClick || disabled;
  return (
    <button
      aria-busy={loading || undefined}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-[6px] border border-line bg-paper p-3.5 text-[12px] text-navy transition-opacity",
        inert
          ? "cursor-not-allowed opacity-40"
          : "hover:opacity-90 active:scale-[0.99]"
      )}
      disabled={inert}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <HugeiconsIcon
          className="animate-spin"
          icon={Loading03Icon}
          size={14}
          strokeWidth={1.8}
        />
      ) : (
        glyph
      )}
      <span>{label}</span>
      <ActionKbd>{hint}</ActionKbd>
    </button>
  );
}

function ActionKbd({
  children,
  onDark = false,
}: {
  children: string;
  onDark?: boolean;
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-[18px] min-w-[18px] select-none items-center justify-center rounded-[4px] px-1 font-medium font-sans text-[10px]",
        onDark ? "bg-white/10 text-[#c9d3dc]" : "bg-mist text-slate"
      )}
    >
      {children}
    </kbd>
  );
}

/* ---------------- Mobile ---------------- */

function HorizontalDock({
  onShortlist,
  onSkip,
  onUndo,
  onDefer,
  pendingAction = null,
  disabled,
  keepLabel,
}: Props & { keepLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-5 pt-[22px] pb-4">
      <CircleAction
        ariaLabel="Undo last swipe"
        disabled={disabled}
        loading={pendingAction === "undo"}
        onClick={onUndo}
      >
        <ArrowBackGlyph />
      </CircleAction>
      <CircleAction
        ariaLabel="Skip"
        className="text-navy"
        disabled={disabled}
        loading={pendingAction === "skip"}
        onClick={onSkip}
      >
        <CloseGlyph />
      </CircleAction>
      {onDefer ? (
        <DeferMenu
          onDefer={onDefer}
          trigger={
            <button
              aria-busy={pendingAction === "defer" || undefined}
              aria-label="Defer — need more info"
              className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-line bg-paper text-slate transition-colors hover:bg-mist disabled:opacity-50"
              disabled={disabled}
              type="button"
            >
              {pendingAction === "defer" ? (
                <HugeiconsIcon
                  className="animate-spin"
                  icon={Loading03Icon}
                  size={18}
                  strokeWidth={1.8}
                />
              ) : (
                <HugeiconsIcon icon={Clock01Icon} size={19} strokeWidth={1.6} />
              )}
            </button>
          }
        />
      ) : null}
      <button
        aria-busy={pendingAction === "shortlist" || undefined}
        aria-label="Shortlist"
        className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 truncate rounded-[32px] bg-primary font-medium text-[13px] text-white tracking-[0.04em] transition-opacity hover:opacity-95 disabled:opacity-50"
        disabled={disabled}
        onClick={onShortlist}
        type="button"
      >
        {pendingAction === "shortlist" ? (
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
          />
        ) : (
          <HeartOutlineGlyph />
        )}
        <span>{keepLabel}</span>
      </button>
    </div>
  );
}

function CircleAction({
  children,
  ariaLabel,
  onClick,
  disabled,
  loading = false,
  className,
}: {
  children: ReactNode;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex size-[50px] shrink-0 items-center justify-center rounded-full border border-line bg-paper text-slate transition-colors hover:bg-mist disabled:opacity-50",
        className
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <HugeiconsIcon
          className="animate-spin text-slate"
          icon={Loading03Icon}
          size={18}
          strokeWidth={1.8}
        />
      ) : (
        children
      )}
    </button>
  );
}

/* ---------------- Glyphs ---------------- */

/** ← undo arrow with tail (matches the Paper SVG). */
function ArrowBackGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 18 18"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 9L7 5M3 9L7 13M3 9H15"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 5L13 13M13 5L5 13"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Filled copper heart for the desktop Keep button. */
function HeartFilledGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 14C8 14 1.5 10 1.5 5.5C1.5 3.5 3 2 5 2C6.5 2 7.5 3 8 4C8.5 3 9.5 2 11 2C13 2 14.5 3.5 14.5 5.5C14.5 10 8 14 8 14Z"
        fill="#D77A4A"
      />
    </svg>
  );
}

/** Outline heart for the mobile Keep pill (stroke pins #eef1f4). */
function HeartOutlineGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 14C8 14 1.5 10 1.5 5.5C1.5 3.5 3 2 5 2C6.5 2 7.5 3 8 4C8.5 3 9.5 2 11 2C13 2 14.5 3.5 14.5 5.5C14.5 10 8 14 8 14Z"
        stroke="#EEF1F4"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
