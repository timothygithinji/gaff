/**
 * Desktop / laptop / tablet kanban for the shortlist pipeline.
 *
 * Four active columns — Both kept, In conversation, Viewing booked,
 * Offer placed (Paper "Shortlist · Desktop" 37K-0) — followed by two
 * read-out lanes for cards out of the running: Passed (archived with
 * reason `passed`) and Archived (every other archive reason, each card
 * showing its reason). The ⋯ menu still archives with a specific reason;
 * dropping onto Archived files the card as `other`.
 *
 * Responsive grid: 4 cols at `xl` (laptop/desktop), 2 cols at `md`
 * (tablet — Paper shows two columns with the rest scrolling), all
 * stacked below that (mobile uses {@link PipelineMobile} instead).
 *
 * Cards drag between the four columns via `@dnd-kit/core` (pointer +
 * keyboard sensors). Each card carries a hover ⋯ menu for explicit
 * move / archive so the board works without dragging too.
 *
 * Every card rests compact (48px thumbnail + two lines). On hover/focus
 * it morphs — via `motion`'s shared `layout` animation — into the
 * enlarged lead layout (full-width photo banner + meta + status
 * footnote), then back out. The FLIP morph tweens the row→column change
 * smoothly rather than snapping between the two layouts.
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
  Calendar03Icon,
  Cancel01Icon,
  Clock01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
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
import { NotesViewingDialog } from "./notes-viewing-dialog";
import {
  ARCHIVED_REASON_LABELS,
  NotesDot,
  STAGE_LABEL,
  StageCountPill,
  ViewingChip,
  formatPrice,
  metaLine,
  useAuditLine,
} from "./pipeline-shared";

/**
 * Shared spring for the compact ⇄ enlarged hover morph (FLIP layout). A
 * lightly-damped spring reads smoother than a fixed-duration tween — it
 * eases in and settles organically. `bounce` is kept low so the card
 * (and the siblings it pushes) settles without a distracting wobble.
 */
const MORPH_TRANSITION = {
  type: "spring",
  duration: 0.5,
  bounce: 0.12,
} as const;

/** The four active stages Paper renders on the board. */
const BOARD_STATUSES: PipelineStatus[] = [
  "shortlisted",
  "contacted",
  "viewing_booked",
  "offer_made",
];

/**
 * Board columns left-to-right. "passed" is a pseudo-column: it isn't a
 * status but a view onto archived cards whose reason is `passed`, given
 * its own lane so a passed pick is visibly out of the running (rather than
 * vanishing into the ⋯ menu). Dropping a card here archives it as `passed`.
 */
const PASSED_COLUMN = "passed" as const;
/**
 * The catch-all archive lane at the far right: every archived card whose
 * reason ISN'T `passed` (those live in the Passed lane), each card showing
 * its reason. Dropping here archives as `other`; use the ⋯ menu to pick a
 * specific reason. It's the real `archived` status, so card moves out of it
 * (back to an active stage) un-archive cleanly.
 */
const ARCHIVED_COLUMN = "archived" as const;
type BoardColumnId = PipelineStatus | typeof PASSED_COLUMN;
const BOARD_COLUMNS: BoardColumnId[] = [
  ...BOARD_STATUSES,
  PASSED_COLUMN,
  ARCHIVED_COLUMN,
];

const EMPTY_HINTS: Record<BoardColumnId, string> = {
  shortlisted: "Picks you both kept land here",
  contacted: "Drop a card here once you've reached out",
  viewing_booked: "Drop a card here once a viewing's booked",
  offer_made: "Drop a card here once you've offered",
  archived: "Cards you've archived show up here",
  passed: "Drop a card here when you've passed on it",
};

/** Column heading per board column. */
function columnLabel(col: BoardColumnId): string {
  return col === PASSED_COLUMN ? "Passed" : STAGE_LABEL[col];
}

/** Cards rendered in a board column — `passed` filters the archived
 * bucket down to the passed reason, `archived` takes every other archive
 * reason, and every active column is just its status. */
function cardsForColumn(
  columns: PipelineColumns,
  col: BoardColumnId
): PipelineCard[] {
  if (col === PASSED_COLUMN) {
    return columns.archived.filter((c) => c.archivedReason === "passed");
  }
  if (col === ARCHIVED_COLUMN) {
    return columns.archived.filter((c) => c.archivedReason !== "passed");
  }
  return columns[col];
}

type Props = {
  columns: PipelineColumns;
  onOpenCluster: (clusterId: string) => void;
  onMove: (clusterId: string, to: PipelineStatus) => void;
  onArchive: (clusterId: string, reason: PipelineArchivedReason) => void;
  /** Hover/focus a card → warm its listing-detail payload (optional). */
  onHoverCluster?: (clusterId: string) => void;
  disabled?: boolean;
};

function findCard(
  columns: PipelineColumns,
  clusterId: string
): PipelineCard | null {
  for (const col of BOARD_COLUMNS) {
    const hit = cardsForColumn(columns, col).find(
      (c) => c.clusterId === clusterId
    );
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** What a drop of `card` onto column `to` should do — kept pure so the
 * drag handler stays a thin dispatch. `null` means a no-op. */
type DropAction =
  | { kind: "move"; to: PipelineStatus }
  | { kind: "archive"; reason: PipelineArchivedReason };

function resolveDrop(card: PipelineCard, to: BoardColumnId): DropAction | null {
  // Passed lane: archive as `passed` (no-op if it already is).
  if (to === PASSED_COLUMN) {
    return card.archivedReason === "passed"
      ? null
      : { kind: "archive", reason: "passed" };
  }
  // Catch-all Archived lane: file as `other`. A card already filed under a
  // non-passed reason stays put; a passed card drops the `passed` flavour.
  if (to === ARCHIVED_COLUMN) {
    return card.status === "archived" && card.archivedReason !== "passed"
      ? null
      : { kind: "archive", reason: "other" };
  }
  // Any active lane is a plain status move (also un-archives the card).
  return card.status === to ? null : { kind: "move", to };
}

export function PipelineKanban({
  columns,
  onOpenCluster,
  onMove,
  onArchive,
  onHoverCluster,
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
    const to = String(over.id) as BoardColumnId;
    const card = findCard(columns, clusterId);
    if (!card) {
      return;
    }
    const action = resolveDrop(card, to);
    if (action?.kind === "move") {
      onMove(clusterId, action.to);
    } else if (action?.kind === "archive") {
      onArchive(clusterId, action.reason);
    }
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((col) => (
          <Column
            cards={cardsForColumn(columns, col)}
            column={col}
            disabled={disabled}
            key={col}
            onArchive={onArchive}
            onHoverCluster={onHoverCluster}
            onMove={onMove}
            onOpenCluster={onOpenCluster}
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
  column,
  cards,
  onOpenCluster,
  onMove,
  onArchive,
  onHoverCluster,
  disabled,
}: {
  column: BoardColumnId;
  cards: PipelineCard[];
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "onHoverCluster" | "disabled"
>) {
  const { setNodeRef, isOver } = useDroppable({ id: column, disabled });
  // While the column is scrolling, suppress hover-expansion: a card
  // growing under the cursor mid-scroll shifts everything below it and
  // makes the scroll lurch ("jumps an item"). We re-enable shortly after
  // the wheel/track settles; a deliberate mouse move then re-expands.
  const [scrolling, setScrolling] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
      }
    },
    []
  );
  function handleScroll() {
    setScrolling(true);
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
    }
    idleTimer.current = setTimeout(() => setScrolling(false), 180);
  }
  return (
    <section
      className={cn(
        "flex w-[280px] shrink-0 flex-col gap-2.5 rounded-md transition-colors",
        isOver && 'outline-dashed outline-2 outline-[#d77a4a]'
      )}
      ref={setNodeRef}
    >
      <header className="flex shrink-0 items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[12px] text-navy uppercase leading-4 tracking-[0.12em]">
            {columnLabel(column)}
          </h3>
          <StageCountPill
            count={cards.length}
            status={column === PASSED_COLUMN ? "archived" : column}
          />
        </div>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1"
        onScroll={handleScroll}
      >
        {cards.length === 0 ? (
          <EmptyColumn hint={EMPTY_HINTS[column]} isOver={isOver} />
        ) : (
          cards.map((card) => (
            <Card
              card={card}
              disabled={disabled}
              key={card.clusterId}
              onArchive={onArchive}
              onHoverCluster={onHoverCluster}
              onMove={onMove}
              onOpenCluster={onOpenCluster}
              suppressed={scrolling}
            />
          ))
        )}
      </div>
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
  onOpenCluster,
  onMove,
  onArchive,
  onHoverCluster,
  disabled,
  suppressed,
}: {
  card: PipelineCard;
  /** Column is scrolling — hold the card compact so it can't shift the
   * scroll under the cursor. */
  suppressed?: boolean;
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "onHoverCluster" | "disabled"
>) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.clusterId,
    disabled,
  });
  const [hovered, setHovered] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Collapse the moment a scroll starts; the pointer is parked over a
  // card, so we also wait for a fresh mouse move (not just the lingering
  // hover) before expanding again — otherwise it pops the instant the
  // scroll settles.
  useEffect(() => {
    if (suppressed) {
      setHovered(false);
    }
  }, [suppressed]);
  // Don't expand mid-drag — the lifted DragOverlay already shows the
  // enlarged preview, and a morphing source card fights the drag.
  const expanded = hovered && !isDragging && !suppressed;

  function arm() {
    if (suppressed) {
      return;
    }
    setHovered(true);
  }
  function handleEnter() {
    arm();
    if (!suppressed) {
      onHoverCluster?.(card.clusterId);
    }
  }

  return (
    <motion.article
      className={cn(
        // shrink-0: cards are flex children of the column; without it a
        // full column compresses each card below its content (the photo
        // then bleeds past the overflow-hidden box).
        "group relative shrink-0 overflow-hidden rounded-md border border-line bg-card transition-shadow",
        expanded &&
          "shadow-[0px_1px_2px_0px_rgba(15,42,63,0.04),0px_12px_32px_-8px_rgba(15,42,63,0.12)]",
        isDragging && "opacity-40"
      )}
      layout
      onBlur={() => setHovered(false)}
      onFocus={handleEnter}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={arm}
      ref={setNodeRef}
      transition={{ layout: MORPH_TRANSITION }}
      {...attributes}
      {...listeners}
    >
      <CardBody
        card={card}
        expanded={expanded}
        onOpen={() => onOpenCluster(card.clusterId)}
      />
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 data-[open]:opacity-100">
        <CardMenu
          card={card}
          disabled={disabled}
          onArchive={onArchive}
          onEditDetails={() => setDetailsOpen(true)}
          onMove={onMove}
        />
      </div>
      <NotesViewingDialog
        card={card}
        onOpenChange={setDetailsOpen}
        open={detailsOpen}
      />
    </motion.article>
  );
}

/**
 * One card body that morphs between the compact row (thumbnail-left) and
 * the enlarged lead layout (full-bleed photo on top) as `expanded`
 * flips. `motion`'s `layout` does the FLIP: the photo grows and slides
 * up, the text reflows, and the status footnote fades in. The button
 * carries no padding so the expanded photo can sit flush to the card
 * edges — spacing lives on the thumbnail margin / text block instead.
 */
function CardBody({
  card,
  expanded,
  onOpen,
}: {
  card: PipelineCard;
  expanded: boolean;
  onOpen: () => void;
}) {
  const meta = metaLine(card);
  const audit = useAuditLine(card);
  return (
    <motion.button
      className={cn(
        "flex w-full text-left",
        expanded ? "flex-col" : "flex-row items-center"
      )}
      layout
      onClick={onOpen}
      transition={{ layout: MORPH_TRANSITION }}
      type="button"
    >
      <motion.div
        className={cn(
          "shrink-0 overflow-hidden bg-mist",
          expanded ? "h-[124px] w-full" : "m-3 size-12 rounded-md"
        )}
        layout
        transition={{ layout: MORPH_TRANSITION }}
      >
        {card.headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component.
          <img
            alt={card.headline.addressRaw}
            className="h-full w-full object-cover"
            loading="lazy"
            src={card.headline.photoUrl}
          />
        ) : null}
      </motion.div>
      <motion.div
        className={cn(
          "flex min-w-0 grow flex-col",
          expanded ? "gap-1.5 px-3.5 pt-2.5 pb-3" : "gap-0.5 py-3 pr-3.5"
        )}
        layout="position"
        transition={{ layout: MORPH_TRANSITION }}
      >
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 grow truncate font-semibold text-[13px] text-navy leading-4">
            {card.headline.addressRaw}
          </span>
          <span className="shrink-0 font-semibold text-[12px] text-navy leading-4">
            {formatPrice(card.headline.priceMonthly)}
          </span>
        </div>
        {meta ? (
          <span className="truncate text-[11px] text-slate leading-[14px]">
            {meta}
          </span>
        ) : null}
        {/* Compact reason chip for archived cards — keeps the "why" visible
            at rest; the expanded footnote leads with the same reason. */}
        {!expanded && card.archivedReason ? (
          <span className="mt-0.5 inline-flex w-fit rounded-full border border-line bg-card px-1.5 py-0.5 font-semibold text-[10px] text-slate">
            {ARCHIVED_REASON_LABELS[card.archivedReason]}
          </span>
        ) : null}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              initial={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.28, ease: "easeOut", delay: 0.04 }}
            >
              <StatusFootnote audit={audit} card={card} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.button>
  );
}

/** The lead line of a card footnote: archived reason, booked-viewing date
 * (copper pill), a copper clock pill for viewing / offer stages (Paper),
 * or a plain audit line — in that priority order. */
function PrimaryFootnote({
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
  if (card.viewingDate) {
    return <ViewingChip date={card.viewingDate} />;
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

/** Card footnote: the primary line plus a short notes preview underneath. */
function StatusFootnote({
  card,
  audit,
}: {
  card: PipelineCard;
  audit: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <PrimaryFootnote audit={audit} card={card} />
      {card.notes ? (
        <span className="flex items-start gap-1.5 text-[11px] text-slate leading-[15px]">
          <NotesDot className="mt-0.5" />
          <span className="line-clamp-2">{card.notes}</span>
        </span>
      ) : null}
    </div>
  );
}

function CardMenu({
  card,
  onMove,
  onArchive,
  onEditDetails,
  disabled,
}: {
  card: PipelineCard;
  onEditDetails: () => void;
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
          <DropdownMenuItem onClick={onEditDetails}>
            <HugeiconsIcon icon={Calendar03Icon} size={12} strokeWidth={2} />
            Notes &amp; viewing
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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
