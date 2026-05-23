/**
 * Desktop chrome around the existing `SearchForm` — used by both
 * `/searches/new` and `/searches/$id`. Shown above the `md` breakpoint.
 *
 *   - LEFT: the standard `AdminSidebar`.
 *   - MAIN: a sticky breadcrumb header (with a Pause action in edit
 *     mode), the `SearchForm` in its "desktop" layout, and an
 *     edge-to-edge sticky CTA footer rendered by `CostEstimate`.
 */
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AdminSidebar } from "../layout/admin-sidebar";
import { SearchForm, type SearchFormValues } from "./search-form";

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
};

export function DesktopSearchCreate(props: Props) {
  return (
    <AdminSidebar mode="desktop-only">
      <Breadcrumb
        mode={props.mode}
        onCancel={props.onCancel}
        pauseAction={props.pauseAction}
      />
      <SearchForm {...props} layout="desktop" />
    </AdminSidebar>
  );
}

function Breadcrumb({
  mode,
  onCancel,
  pauseAction,
}: {
  mode: "create" | "edit";
  onCancel?: () => void;
  pauseAction?: ActionState;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-bone border-b bg-ground px-10 py-5">
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
      {mode === "edit" && pauseAction ? (
        <button
          aria-busy={pauseAction.pending || undefined}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-muted-foreground text-xs disabled:opacity-50"
          disabled={pauseAction.disabled}
          onClick={pauseAction.onClick}
          type="button"
        >
          {pauseAction.pending ? (
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              size={12}
              strokeWidth={2}
            />
          ) : null}
          {pauseAction.pending && pauseAction.pendingLabel
            ? pauseAction.pendingLabel
            : pauseAction.label}
        </button>
      ) : null}
    </header>
  );
}
