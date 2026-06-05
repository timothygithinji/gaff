/**
 * Desktop chrome around the existing `SearchForm` — used by both
 * `/searches/new` and `/searches/$id`. Shown above the `md` breakpoint.
 *
 *   - LEFT: the standard `AdminSidebar`.
 *   - MAIN: a sticky breadcrumb header and the `SearchForm` in its
 *     "desktop" layout. The header hosts the primary submit CTA (it
 *     submits the form via `form={DESKTOP_FORM_ID}`), plus Pause/Delete
 *     actions in edit mode.
 */
import {
  Delete02Icon,
  Loading03Icon,
  PauseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { AdminSidebar } from "../layout/admin-sidebar";
import {
  DESKTOP_FORM_ID,
  SearchForm,
  type SearchFormValues,
} from "./search-form";

type ActionState = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Show a spinner next to the label while the underlying mutation runs. */
  pending?: boolean;
  /** Label shown alongside the spinner when `pending` is true. */
  pendingLabel?: string;
};

type Props = {
  mode: "create" | "edit";
  initial?: Partial<SearchFormValues>;
  pending?: boolean;
  onCancel?: () => void;
  onReset?: () => void;
  onSubmit: (values: SearchFormValues) => void;
  /** Edit-mode-only — pause / resume the active schedule. */
  pauseAction?: ActionState;
  /** Edit-mode-only — soft-delete the search (hidden everywhere). */
  deleteAction?: ActionState;
  /** Edit-mode-only — run the normal incremental scrape on demand. */
  scrapeAction?: ActionState;
  /** Edit-mode-only — one-off full-depth backfill of the current inventory. */
  backfillAction?: ActionState;
};

export function DesktopSearchCreate(props: Props) {
  // The Save CTA lives in the breadcrumb, outside the form, so the form
  // reports its dirtiness up here to gate the button.
  const [dirty, setDirty] = useState(false);
  return (
    <AdminSidebar mode="desktop-only">
      <Breadcrumb
        backfillAction={props.backfillAction}
        deleteAction={props.deleteAction}
        dirty={dirty}
        mode={props.mode}
        onCancel={props.onCancel}
        pauseAction={props.pauseAction}
        pending={props.pending}
        scrapeAction={props.scrapeAction}
      />
      <SearchForm {...props} layout="desktop" onDirtyChange={setDirty} />
    </AdminSidebar>
  );
}

function Breadcrumb({
  mode,
  onCancel,
  pauseAction,
  deleteAction,
  scrapeAction,
  backfillAction,
  pending,
  dirty,
}: {
  mode: "create" | "edit";
  onCancel?: () => void;
  pauseAction?: ActionState;
  deleteAction?: ActionState;
  scrapeAction?: ActionState;
  backfillAction?: ActionState;
  pending?: boolean;
  dirty?: boolean;
}) {
  // Primary CTA. It lives here in the header rather than in the form body,
  // so it submits the desktop `<form>` natively via the `form` attribute.
  // Disabled until the form has unsaved changes (or while a save runs).
  const submitLabel = mode === "create" ? "Start watching" : "Save changes";
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-bone border-b bg-ground/85 px-6 py-5 backdrop-blur lg:px-10">
      <div className="flex items-center gap-3.5">
        <button
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card font-medium text-foreground text-xs"
          onClick={onCancel}
          type="button"
        >
          ✕
        </button>
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-2 text-xs"
        >
          <span className="text-muted-foreground">Searches</span>
          <span className="text-[#B5A893]">/</span>
          <span className="font-semibold text-foreground">
            {mode === "create" ? "New search" : "Edit search"}
          </span>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-busy={pending || undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 font-medium text-[#eef1f4] text-xs disabled:opacity-50"
          disabled={pending || !dirty}
          form={DESKTOP_FORM_ID}
          type="submit"
        >
          {pending ? (
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              size={12}
              strokeWidth={2}
            />
          ) : null}
          {pending ? "Saving…" : submitLabel}
        </button>
        {mode === "edit" && scrapeAction ? (
          <ActionButton
            action={scrapeAction}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-muted-foreground text-xs disabled:opacity-50"
          />
        ) : null}
        {mode === "edit" && backfillAction ? (
          <ActionButton
            action={backfillAction}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-muted-foreground text-xs disabled:opacity-50"
          />
        ) : null}
        {mode === "edit" && pauseAction ? (
          <ActionButton
            action={pauseAction}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-muted-foreground text-xs disabled:opacity-50"
            icon={PauseIcon}
          />
        ) : null}
        {mode === "edit" && deleteAction ? (
          <ActionButton
            action={deleteAction}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-medium text-destructive text-xs hover:bg-destructive/20 disabled:opacity-50"
            icon={Delete02Icon}
          />
        ) : null}
      </div>
    </header>
  );
}

/**
 * A pause/delete action button in the breadcrumb. Renders `icon` at rest
 * (omit for icon-less buttons like Pause), swaps to a spinner while the
 * action is `pending`, and shows `pendingLabel` in place of `label`.
 */
function ActionButton({
  action,
  className,
  icon,
}: {
  action: ActionState;
  className: string;
  icon?: typeof Delete02Icon;
}) {
  const glyph = action.pending ? Loading03Icon : icon;
  return (
    <button
      aria-busy={action.pending || undefined}
      className={className}
      disabled={action.disabled}
      onClick={action.onClick}
      type="button"
    >
      {glyph ? (
        <HugeiconsIcon
          className={action.pending ? "animate-spin" : undefined}
          icon={glyph}
          size={12}
          strokeWidth={2}
        />
      ) : null}
      {action.pending && action.pendingLabel
        ? action.pendingLabel
        : action.label}
    </button>
  );
}
