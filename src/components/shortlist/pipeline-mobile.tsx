/**
 * Mobile pipeline view — stage tabs across the top, list of cards
 * beneath. The kanban-as-five-columns layout is unusable on a narrow
 * viewport, so mobile gets a one-column-at-a-time tab strip with the
 * same move/archive actions on each card.
 */
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Loading03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PIPELINE_STATUSES,
  type PipelineArchivedReason,
  type PipelineStatus,
} from "../../lib/pipeline-status";
import type {
  PipelineCard,
  PipelineColumns,
} from "../../server/functions/pipeline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

const STATUS_LABEL: Record<PipelineStatus, string> = {
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  viewing_booked: "Viewing",
  offer_made: "Offer",
  archived: "Archived",
};

const ARCHIVED_REASON_LABELS: Record<PipelineArchivedReason, string> = {
  accepted: "We took it",
  passed: "We passed",
  let_to_someone_else: "Let to someone else",
  withdrawn: "Listing withdrawn",
  other: "Other",
};

type PendingMove = {
  clusterId: string;
  to: PipelineStatus;
} | null;

type Props = {
  columns: PipelineColumns;
  active: PipelineStatus;
  onActiveChange: (s: PipelineStatus) => void;
  onOpenCluster: (clusterId: string) => void;
  onMove: (clusterId: string, to: PipelineStatus) => void;
  onArchive: (clusterId: string, reason: PipelineArchivedReason) => void;
  pendingMove?: PendingMove;
  disabled?: boolean;
};

export function PipelineMobile({
  columns,
  active,
  onActiveChange,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: Props) {
  const cards = columns[active];
  return (
    <div className="flex flex-col">
      <div className="flex gap-1.5 overflow-x-auto border-border border-b px-6 pb-3">
        {PIPELINE_STATUSES.map((status) => {
          const isActive = status === active;
          const count = columns[status].length;
          return (
            <button
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-[12px] transition-colors ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground"
              }`}
              key={status}
              onClick={() => onActiveChange(status)}
              type="button"
            >
              <span>{STATUS_LABEL[status]}</span>
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  isActive
                    ? "bg-background/15"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-4">
        {cards.length === 0 ? (
          <p className="rounded-2xl bg-muted p-8 text-center text-muted-foreground text-sm">
            Nothing in {STATUS_LABEL[active]} yet.
          </p>
        ) : (
          cards.map((card) => (
            <Row
              card={card}
              disabled={disabled}
              key={card.clusterId}
              onArchive={onArchive}
              onMove={onMove}
              onOpenCluster={onOpenCluster}
              pendingMove={pendingMove}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Row({
  card,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: {
  card: PipelineCard;
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "pendingMove" | "disabled"
>) {
  const isPending =
    pendingMove?.clusterId === card.clusterId &&
    pendingMove?.to !== card.status;
  const prev = previousStatus(card.status);
  const next = nextStatus(card.status);
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        className="flex w-full items-stretch gap-3 text-left"
        onClick={() => onOpenCluster(card.clusterId)}
        type="button"
      >
        <div className="aspect-square w-24 shrink-0 overflow-hidden bg-muted">
          {card.headline.photoUrl ? (
            // biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component.
            <img
              alt={card.headline.addressRaw}
              className="h-full w-full object-cover"
              loading="lazy"
              src={card.headline.photoUrl}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 py-3 pr-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-[16px] text-foreground leading-tight">
              {formatPrice(card.headline.priceMonthly)}
              <span className="ml-0.5 text-[11px] text-muted-foreground">
                /mo
              </span>
            </span>
            <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
              {card.headline.bedrooms ?? "?"}b
            </span>
          </div>
          <p className="line-clamp-2 text-[13px] text-foreground leading-tight">
            {card.headline.addressRaw}
          </p>
          <p className="text-[10px] text-muted-foreground">{auditLine(card)}</p>
          {card.archivedReason ? (
            <p className="mt-0.5 inline-flex w-fit rounded-full bg-bone px-2 py-0.5 font-semibold text-[10px] text-primary">
              {ARCHIVED_REASON_LABELS[card.archivedReason]}
            </p>
          ) : null}
        </div>
      </button>
      <footer className="flex items-center justify-between gap-1 border-border border-t bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1">
          <ActionBtn
            disabled={disabled || !prev || isPending}
            label="Move back"
            onClick={() => prev && onMove(card.clusterId, prev)}
          >
            {isPending && pendingMove?.to === prev ? (
              <HugeiconsIcon
                className="animate-spin"
                icon={Loading03Icon}
                size={14}
                strokeWidth={2}
              />
            ) : (
              <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
            )}
          </ActionBtn>
          <ActionBtn
            disabled={disabled || !next || isPending}
            label="Move forward"
            onClick={() => next && onMove(card.clusterId, next)}
          >
            {isPending && pendingMove?.to === next ? (
              <HugeiconsIcon
                className="animate-spin"
                icon={Loading03Icon}
                size={14}
                strokeWidth={2}
              />
            ) : (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2}
              />
            )}
          </ActionBtn>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-bone disabled:opacity-50"
            disabled={disabled}
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={16}
              strokeWidth={2}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {PIPELINE_STATUSES.filter(
                (s) => s !== card.status && s !== "archived"
              ).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onMove(card.clusterId, s)}
                >
                  {STATUS_LABEL[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Archive · reason</DropdownMenuLabel>
              {(
                Object.keys(ARCHIVED_REASON_LABELS) as PipelineArchivedReason[]
              ).map((reason) => (
                <DropdownMenuItem
                  key={reason}
                  onClick={() => onArchive(card.clusterId, reason)}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={12}
                    strokeWidth={2}
                  />
                  {ARCHIVED_REASON_LABELS[reason]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </article>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-bone disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function previousStatus(s: PipelineStatus): PipelineStatus | null {
  const i = PIPELINE_STATUSES.indexOf(s);
  if (i <= 0 || s === "archived") {
    return null;
  }
  return PIPELINE_STATUSES[i - 1] ?? null;
}

function nextStatus(s: PipelineStatus): PipelineStatus | null {
  if (s === "archived") {
    return null;
  }
  const i = PIPELINE_STATUSES.indexOf(s);
  const candidate = PIPELINE_STATUSES[i + 1];
  if (candidate === "archived") {
    return null;
  }
  return candidate ?? null;
}

function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

function auditLine(card: PipelineCard): string {
  const ago = timeAgo(card.lastMovedAt);
  if (card.lastMovedBy) {
    const first = firstNameOf(card.lastMovedBy.name);
    return `${ago} · by ${first}`;
  }
  return ago;
}

const WHITESPACE_RE = /\s+/;

function firstNameOf(name: string): string {
  return (name || "").trim().split(WHITESPACE_RE)[0] || "them";
}

function timeAgo(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}w ago`;
  }
  return new Date(date).toLocaleDateString("en-GB");
}
