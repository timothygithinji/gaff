/**
 * Desktop / laptop / tablet kanban for the shortlist pipeline.
 *
 * Four active columns — Both kept, In conversation, Viewing booked,
 * Offer placed (Paper "Shortlist · Desktop" 37K-0). Archived is NOT a
 * column; it needs a reason, so it lives in the ⋯ menu and removes the
 * card from the board.
 *
 * Responsive grid: 4 cols at `xl` (laptop/desktop), 2 cols at `md`
 * (tablet — Paper shows two columns with the rest scrolling), all
 * stacked below that (mobile uses {@link PipelineMobile} instead).
 *
 * Cards drag between the four columns via `@dnd-kit/core` (pointer +
 * keyboard sensors). Each card carries a hover ⋯ menu for explicit
 * move / archive so the board works without dragging too.
 *
 * The FIRST card in a column renders large (full-width photo + meta);
 * the rest render compact (48px thumbnail + two lines), matching Paper's
 * lead-card rhythm.
 */
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Cancel01Icon,
  Clock01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  PIPELINE_ARCHIVED_REASONS,
  type PipelineArchivedReason,
  type PipelineStatus,
} from "../../lib/pipeline-status";
import { cn } from "../../lib/utils";
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
import {
  ARCHIVED_REASON_LABELS,
  STAGE_LABEL,
  StageCountPill,
  formatPrice,
  metaLine,
  outcodeOf,
  useAuditLine,
} from "./pipeline-shared";

/** Columns Paper renders on the desktop board (Archived lives in ⋯). */
const BOARD_STATUSES: PipelineStatus[] = [
  "shortlisted",
  "contacted",
  "viewing_booked",
  "offer_made",
];

const EMPTY_HINTS: Record<PipelineStatus, string> = {
  shortlisted: "Picks you both kept land here",
  contacted: "Drop a card here once you've reached out",
  viewing_booked: "Drop a card here once a viewing's booked",
  offer_made: "Drop a card here once you've offered",
  archived: "",
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
  for (const status of BOARD_STATUSES) {
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
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_STATUSES.map((status) => (
          <Column
            cards={columns[status]}
            disabled={disabled}
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
  onOpenCluster,
  onMove,
  onArchive,
  disabled,
}: {
  status: PipelineStatus;
  cards: PipelineCard[];
} & Pick<Props, "onOpenCluster" | "onMove" | "onArchive" | "disabled">) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled });
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-md transition-colors",
        isOver && 'outline-dashed outline-2 outline-[#d77a4a]'
      )}
      ref={setNodeRef}
    >
      <header className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[12px] text-navy uppercase leading-4 tracking-[0.12em]">
            {STAGE_LABEL[status]}
          </h3>
          <StageCountPill count={cards.length} status={status} />
        </div>
      </header>
      {cards.length === 0 ? (
        <EmptyColumn hint={EMPTY_HINTS[status]} isOver={isOver} />
      ) : (
        cards.map((card, idx) => (
          <Card
            card={card}
            disabled={disabled}
            key={card.clusterId}
            lead={idx === 0}
            onArchive={onArchive}
            onMove={onMove}
            onOpenCluster={onOpenCluster}
          />
        ))
      )}
    </section>
  );
}

function EmptyColumn({ hint, isOver }: { hint: string; isOver: boolean }) {
  return (
    <div className="flex h-[110px] flex-col items-center justify-center gap-2 rounded-md border border-line border-dashed bg-card/40 px-6 text-center">
      <HugeiconsIcon
        className="text-slate-2"
        icon={Clock01Icon}
        size={22}
        strokeWidth={1.5}
      />
      <p className="text-[12px] text-slate leading-[16px]">
        {isOver ? "Drop to move here" : hint}
      </p>
    </div>
  );
}

function Card({
  card,
  lead,
  onOpenCluster,
  onMove,
  onArchive,
  disabled,
}: {
  card: PipelineCard;
  lead: boolean;
} & Pick<Props, "onOpenCluster" | "onMove" | "onArchive" | "disabled">) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.clusterId,
    disabled,
  });
  return (
    <article
      className={cn(
        "group relative rounded-md border border-line bg-card transition-shadow hover:shadow-[0px_1px_2px_0px_rgba(15,42,63,0.04),0px_12px_32px_-8px_rgba(15,42,63,0.12)]",
        isDragging && "opacity-40"
      )}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      {lead ? (
        <LeadCardBody card={card} onOpen={() => onOpenCluster(card.clusterId)} />
      ) : (
        <CompactCardBody
          card={card}
          onOpen={() => onOpenCluster(card.clusterId)}
        />
      )}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 data-[open]:opacity-100">
        <CardMenu
          card={card}
          disabled={disabled}
          onArchive={onArchive}
          onMove={onMove}
        />
      </div>
    </article>
  );
}

function LeadCardBody({
  card,
  onOpen,
}: {
  card: PipelineCard;
  onOpen: () => void;
}) {
  const meta = metaLine(card);
  const audit = useAuditLine(card);
  return (
    <button
      className="flex w-full flex-col overflow-hidden rounded-md text-left"
      onClick={onOpen}
      type="button"
    >
      <div className="h-[110px] w-full shrink-0 overflow-hidden bg-mist">
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
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 grow truncate font-semibold text-[13px] text-navy leading-4">
            {card.headline.addressRaw}
          </span>
          <span className="shrink-0 font-semibold text-[12px] text-navy leading-4">
            {formatPrice(card.headline.priceMonthly)}
          </span>
        </div>
        {meta ? (
          <span className="text-[11px] text-slate leading-[14px]">{meta}</span>
        ) : null}
        <StatusFootnote audit={audit} card={card} />
      </div>
    </button>
  );
}

function CompactCardBody({
  card,
  onOpen,
}: {
  card: PipelineCard;
  onOpen: () => void;
}) {
  const audit = useAuditLine(card);
  const sub = [formatPrice(card.headline.priceMonthly), outcodeOf(card.headline.postcode), audit]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      className="flex w-full gap-3 rounded-md px-3.5 py-3 text-left"
      onClick={onOpen}
      type="button"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-mist">
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
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate font-semibold text-[12px] text-navy leading-4">
          {card.headline.addressRaw}
        </span>
        <span className="truncate text-[10px] text-slate leading-3">{sub}</span>
      </div>
    </button>
  );
}

/** Footnote on lead cards: a copper-tinted "clock" pill for viewing /
 * offer stages (Paper), otherwise a plain audit line. */
function StatusFootnote({
  card,
  audit,
}: {
  card: PipelineCard;
  audit: string;
}) {
  if (card.archivedReason) {
    return (
      <span className="inline-flex w-fit rounded-full border border-line bg-card px-2 py-0.5 font-semibold text-[10px] text-slate">
        {ARCHIVED_REASON_LABELS[card.archivedReason]}
      </span>
    );
  }
  if (card.status === "viewing_booked" || card.status === "offer_made") {
    return (
      <span className="flex items-center gap-1.5 rounded-sm bg-[#d77a4a1a] px-2.5 py-1.5">
        <HugeiconsIcon
          className="shrink-0 text-[#d77a4a]"
          icon={Clock01Icon}
          size={12}
          strokeWidth={1.5}
        />
        <span className="text-[11px] text-navy leading-[14px]">{audit}</span>
      </span>
    );
  }
  return <span className="text-[11px] text-slate leading-[14px]">{audit}</span>;
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
        className="flex size-7 items-center justify-center rounded-md bg-card/90 text-slate shadow-sm hover:bg-mist disabled:opacity-50"
        disabled={disabled}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {BOARD_STATUSES.filter((s) => s !== card.status).map((s) => (
            <DropdownMenuItem key={s} onClick={() => onMove(card.clusterId, s)}>
              {STAGE_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Archive · reason</DropdownMenuLabel>
          {PIPELINE_ARCHIVED_REASONS.map((reason) => (
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

/** Drag preview under the cursor — the lead-card layout, lifted. */
function CardPreview({ card }: { card: PipelineCard }) {
  const meta = metaLine(card);
  return (
    <article className="w-[260px] rotate-2 overflow-hidden rounded-md border border-[#d77a4a] bg-card shadow-xl">
      <div className="h-[110px] w-full overflow-hidden bg-mist">
        {card.headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component.
          <img
            alt={card.headline.addressRaw}
            className="h-full w-full object-cover"
            src={card.headline.photoUrl}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 grow truncate font-semibold text-[13px] text-navy leading-4">
            {card.headline.addressRaw}
          </span>
          <span className="shrink-0 font-semibold text-[12px] text-navy leading-4">
            {formatPrice(card.headline.priceMonthly)}
          </span>
        </div>
        {meta ? (
          <span className="text-[11px] text-slate leading-[14px]">{meta}</span>
        ) : null}
      </div>
    </article>
  );
}
