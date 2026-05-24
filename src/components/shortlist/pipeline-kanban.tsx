/**
 * Desktop kanban for the shortlist pipeline.
 *
 * Five columns — Shortlisted, Contacted, Viewing booked, Offer made,
 * Archived. Cards are dragged between the four active columns via
 * `@dnd-kit/core` (pointer + keyboard sensors, so it works without a
 * mouse). Each card has a dedicated drag handle so the card body stays
 * clickable (opens the listing) and the ⋯ menu stays operable.
 *
 * Archiving is NOT a drop target — it needs a reason, so it lives in
 * the ⋯ menu. The menu also offers "Move to" as an explicit fallback
 * for anyone who'd rather not drag.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Cancel01Icon,
  DragDropVerticalIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
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

const COLUMN_LABELS: Record<PipelineStatus, string> = {
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  viewing_booked: "Viewing booked",
  offer_made: "Offer made",
  archived: "Archived",
};

const COLUMN_HELP: Record<PipelineStatus, string> = {
  shortlisted: "Everyone agreed — pick what to do next",
  contacted: "Reached out to the agent",
  viewing_booked: "Appointment in the diary",
  offer_made: "Waiting on the landlord",
  archived: "Closed out — use ⋯ to archive with a reason",
};

const ARCHIVED_REASON_LABELS: Record<PipelineArchivedReason, string> = {
  accepted: "We took it",
  passed: "We passed",
  let_to_someone_else: "Let to someone else",
  withdrawn: "Listing withdrawn",
  other: "Other",
};

type Props = {
  columns: PipelineColumns;
  onOpenCluster: (clusterId: string) => void;
  onMove: (clusterId: string, to: PipelineStatus) => void;
  onArchive: (clusterId: string, reason: PipelineArchivedReason) => void;
  disabled?: boolean;
};

function findCard(
  columns: PipelineColumns,
  clusterId: string
): PipelineCard | null {
  for (const status of PIPELINE_STATUSES) {
    const hit = columns[status].find((c) => c.clusterId === clusterId);
    if (hit) {
      return hit;
    }
  }
  return null;
}

export function PipelineKanban({
  columns,
  onOpenCluster,
  onMove,
  onArchive,
  disabled,
}: Props) {
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const sensors = useSensors(
    // 6px threshold so a click (open detail) doesn't register as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveCard(findCard(columns, String(e.active.id)));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = e;
    if (!over) {
      return;
    }
    const clusterId = String(active.id);
    const toStatus = String(over.id) as PipelineStatus;
    const card = findCard(columns, clusterId);
    if (!card || card.status === toStatus) {
      return;
    }
    onMove(clusterId, toStatus);
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex min-h-0 gap-3 overflow-x-auto pb-4">
        {PIPELINE_STATUSES.map((status) => (
          <Column
            cards={columns[status]}
            disabled={disabled}
            isDropTarget={status !== "archived"}
            key={status}
            onArchive={onArchive}
            onMove={onMove}
            onOpenCluster={onOpenCluster}
            status={status}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCard ? <CardPreview card={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  cards,
  isDropTarget,
  onOpenCluster,
  onMove,
  onArchive,
  disabled,
}: {
  status: PipelineStatus;
  cards: PipelineCard[];
  isDropTarget: boolean;
} & Pick<Props, "onOpenCluster" | "onMove" | "onArchive" | "disabled">) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !isDropTarget || disabled,
  });
  return (
    <section
      className={`flex w-[280px] shrink-0 flex-col gap-2 rounded-2xl border p-3 transition-colors ${
        isOver
          ? "border-primary border-dashed bg-primary/5"
          : "border-border bg-muted/40"
      }`}
      ref={setNodeRef}
    >
      <header className="flex items-baseline justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-semibold font-serif text-[15px] text-foreground leading-tight">
            {COLUMN_LABELS[status]}
          </h3>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {COLUMN_HELP[status]}
          </p>
        </div>
        <span className="rounded-full bg-bone px-2 py-0.5 font-semibold text-[10px] text-primary">
          {cards.length}
        </span>
      </header>
      <div className="flex min-h-[120px] flex-col gap-2">
        {cards.length === 0 ? (
          <p className="rounded-xl border border-border border-dashed bg-card/40 p-4 text-center text-[11px] text-muted-foreground">
            {isOver ? "Drop to move here" : "Nothing here yet"}
          </p>
        ) : (
          cards.map((card) => (
            <Card
              card={card}
              disabled={disabled}
              key={card.clusterId}
              onArchive={onArchive}
              onMove={onMove}
              onOpenCluster={onOpenCluster}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Card({
  card,
  onOpenCluster,
  onMove,
  onArchive,
  disabled,
}: {
  card: PipelineCard;
} & Pick<Props, "onOpenCluster" | "onMove" | "onArchive" | "disabled">) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.clusterId,
    disabled,
  });
  return (
    <article
      className={`overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm ${
        isDragging ? "opacity-40" : ""
      }`}
      ref={setNodeRef}
    >
      <button
        className="block w-full text-left"
        onClick={() => onOpenCluster(card.clusterId)}
        type="button"
      >
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
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
        <div className="flex flex-col gap-1 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-[15px] text-foreground leading-tight">
              {formatPrice(card.headline.priceMonthly)}
              <span className="ml-0.5 text-[11px] text-muted-foreground">
                /mo
              </span>
            </span>
            <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
              {card.headline.bedrooms ?? "?"}b
            </span>
          </div>
          <p className="line-clamp-2 text-[12px] text-foreground leading-tight">
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
      <footer className="flex items-center justify-between gap-1 border-border border-t bg-muted/30 px-2 py-1.5">
        <button
          aria-label="Drag to move"
          className="flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-bone active:cursor-grabbing disabled:opacity-30"
          disabled={disabled}
          type="button"
          {...attributes}
          {...listeners}
        >
          <HugeiconsIcon
            icon={DragDropVerticalIcon}
            size={14}
            strokeWidth={2}
          />
        </button>
        <CardMenu
          card={card}
          disabled={disabled}
          onArchive={onArchive}
          onMove={onMove}
        />
      </footer>
    </article>
  );
}

function CardMenu({
  card,
  onMove,
  onArchive,
  disabled,
}: {
  card: PipelineCard;
} & Pick<Props, "onMove" | "onArchive" | "disabled">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Card actions"
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-bone disabled:opacity-50"
        disabled={disabled}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={14} strokeWidth={2} />
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
              {COLUMN_LABELS[s]}
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
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              {ARCHIVED_REASON_LABELS[reason]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Drag preview shown under the cursor — the full card (same layout as
 * the one in the column), just lifted with a shadow + slight tilt so it
 * reads as "picked up". Width matches the in-column card (column is
 * w-[280px] with p-3, so the card is 256px).
 */
function CardPreview({ card }: { card: PipelineCard }) {
  return (
    <article className="w-[256px] rotate-2 cursor-grabbing overflow-hidden rounded-xl border border-primary bg-card shadow-xl">
      <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
        {card.headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component.
          <img
            alt={card.headline.addressRaw}
            className="h-full w-full object-cover"
            src={card.headline.photoUrl}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-serif text-[15px] text-foreground leading-tight">
            {formatPrice(card.headline.priceMonthly)}
            <span className="ml-0.5 text-[11px] text-muted-foreground">
              /mo
            </span>
          </span>
          <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            {card.headline.bedrooms ?? "?"}b
          </span>
        </div>
        <p className="line-clamp-2 text-[12px] text-foreground leading-tight">
          {card.headline.addressRaw}
        </p>
        <p className="text-[10px] text-muted-foreground">{auditLine(card)}</p>
      </div>
    </article>
  );
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
