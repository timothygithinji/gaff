/**
 * Mobile pipeline view (Paper "Shortlist · Mobile" 34C-0).
 *
 * Not a single-column switcher — Paper stacks every non-empty stage in
 * one scroll, each under a small-caps stage label + count pill. The
 * FIRST card in a stage renders large (140px photo, mutual badge, status
 * pill); the rest render as 64px-thumbnail rows. Move / archive run from
 * each card's ⋯ menu (plus quick back/forward arrows), so the kanban's
 * actions stay reachable on a narrow viewport.
 *
 * Empty stages are omitted (no point showing four "nothing here" blocks
 * on a phone); a single empty-state shows when the whole pipeline is
 * empty.
 */
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Clock01Icon,
  Loading03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PIPELINE_ARCHIVED_REASONS,
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
import {
  ARCHIVED_REASON_LABELS,
  AvatarStack,
  STAGE_LABEL,
  StageCountPill,
  formatPrice,
  metaLine,
  useAuditLine,
} from "./pipeline-shared";

/** Active stages in board order; Archived shown last when populated. */
const STAGE_ORDER: PipelineStatus[] = [
  "viewing_booked",
  "offer_made",
  "contacted",
  "shortlisted",
  "archived",
];

type PendingMove = {
  clusterId: string;
  to: PipelineStatus;
} | null;

type Props = {
  columns: PipelineColumns;
  memberCount: number;
  onOpenCluster: (clusterId: string) => void;
  onMove: (clusterId: string, to: PipelineStatus) => void;
  onArchive: (clusterId: string, reason: PipelineArchivedReason) => void;
  pendingMove?: PendingMove;
  disabled?: boolean;
};

export function PipelineMobile({
  columns,
  memberCount,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: Props) {
  const populated = STAGE_ORDER.filter((s) => columns[s].length > 0);

  if (populated.length === 0) {
    return (
      <p className="mx-5 rounded-lg bg-mist p-8 text-center text-slate text-sm">
        Nothing in your pipeline yet. Keep swiping on Review — picks you both
        keep land here, ready to move toward a viewing.
      </p>
    );
  }

  return (
    <div className="flex flex-col pb-2">
      {populated.map((status) => (
        <Stage
          cards={columns[status]}
          disabled={disabled}
          key={status}
          memberCount={memberCount}
          onArchive={onArchive}
          onMove={onMove}
          onOpenCluster={onOpenCluster}
          pendingMove={pendingMove}
          status={status}
        />
      ))}
    </div>
  );
}

function Stage({
  status,
  cards,
  memberCount,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: {
  status: PipelineStatus;
  cards: PipelineCard[];
  memberCount: number;
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "pendingMove" | "disabled"
>) {
  const [lead, ...rest] = cards;
  return (
    <section className="flex flex-col">
      <header className="flex items-center gap-2 px-5 pt-3.5 pb-2.5">
        <h2 className="font-semibold text-[11px] text-navy uppercase leading-[14px] tracking-[0.14em]">
          {STAGE_LABEL[status]}
        </h2>
        <StageCountPill count={cards.length} status={status} />
      </header>
      {lead ? (
        <LeadCard
          card={lead}
          disabled={disabled}
          memberCount={memberCount}
          onArchive={onArchive}
          onMove={onMove}
          onOpenCluster={onOpenCluster}
          pendingMove={pendingMove}
        />
      ) : null}
      {rest.map((card) => (
        <RowCard
          card={card}
          disabled={disabled}
          key={card.clusterId}
          memberCount={memberCount}
          onArchive={onArchive}
          onMove={onMove}
          onOpenCluster={onOpenCluster}
          pendingMove={pendingMove}
        />
      ))}
    </section>
  );
}

function LeadCard({
  card,
  memberCount,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: {
  card: PipelineCard;
  memberCount: number;
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "pendingMove" | "disabled"
>) {
  const meta = metaLine(card);
  const audit = useAuditLine(card);
  return (
    <article className="mx-5 mb-3 overflow-hidden rounded-lg border border-line bg-card">
      <button
        className="relative block h-[140px] w-full text-left"
        onClick={() => onOpenCluster(card.clusterId)}
        type="button"
      >
        {card.headline.photoUrl ? (
          // biome-ignore lint/nursery/noImgElement: TanStack Start; no Image component.
          <img
            alt={card.headline.addressRaw}
            className="h-full w-full object-cover"
            loading="lazy"
            src={card.headline.photoUrl}
          />
        ) : (
          <div className="h-full w-full bg-mist" />
        )}
        {memberCount > 1 ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-[#0e2235d9] px-2.5 py-[5px] backdrop-blur-sm">
            <AvatarStack border="navy" members={card.members} />
            <span className='font-semibold text-[#eef1f4] text-[10px] uppercase leading-3 tracking-widest'>
              {memberCount === 2 ? "Both kept" : `All ${memberCount} kept`}
            </span>
          </span>
        ) : null}
      </button>
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="min-w-0 grow truncate font-semibold text-[15px] text-navy leading-[18px]">
            {card.headline.addressRaw}
          </span>
          <span className="shrink-0 font-semibold text-[15px] text-navy leading-[18px]">
            {formatPrice(card.headline.priceMonthly)}
          </span>
        </div>
        {meta ? (
          <span className="text-[12px] text-slate leading-4">{meta}</span>
        ) : null}
        <StatusFootnote audit={audit} card={card} />
      </div>
      <Footer
        card={card}
        disabled={disabled}
        onArchive={onArchive}
        onMove={onMove}
        pendingMove={pendingMove}
      />
    </article>
  );
}

function RowCard({
  card,
  memberCount,
  onOpenCluster,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: {
  card: PipelineCard;
  memberCount: number;
} & Pick<
  Props,
  "onOpenCluster" | "onMove" | "onArchive" | "pendingMove" | "disabled"
>) {
  const meta = metaLine(card);
  const audit = useAuditLine(card);
  return (
    <article className="mx-5 mb-2 overflow-hidden rounded-md border border-line bg-card">
      <button
        className="flex w-full gap-3 p-3 text-left"
        onClick={() => onOpenCluster(card.clusterId)}
        type="button"
      >
        <div className="size-16 shrink-0 overflow-hidden rounded-sm bg-mist">
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
        <div className="flex min-w-0 grow flex-col gap-[3px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 grow truncate font-semibold text-[14px] text-navy leading-[18px]">
              {card.headline.addressRaw}
            </span>
            <span className="shrink-0 font-semibold text-[14px] text-navy leading-[18px]">
              {formatPrice(card.headline.priceMonthly)}
            </span>
          </div>
          {meta ? (
            <span className="text-[11px] text-slate leading-[14px]">
              {meta}
            </span>
          ) : null}
          <div className="flex items-center gap-1.5 pt-1">
            {memberCount > 1 ? <AvatarStack members={card.members} /> : null}
            <span className="text-[10px] text-slate leading-3">{audit}</span>
          </div>
        </div>
      </button>
      <Footer
        card={card}
        disabled={disabled}
        onArchive={onArchive}
        onMove={onMove}
        pendingMove={pendingMove}
      />
    </article>
  );
}

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
      <span className="flex items-center gap-2 rounded-sm border border-[#d77a4a4d] bg-[#d77a4a1a] px-3 py-2.5">
        <HugeiconsIcon
          className="shrink-0 text-[#d77a4a]"
          icon={Clock01Icon}
          size={14}
          strokeWidth={1.5}
        />
        <span className="text-[12px] text-navy leading-4">{audit}</span>
      </span>
    );
  }
  return null;
}

/** Per-card action footer — quick back / forward + the full ⋯ menu. */
function Footer({
  card,
  onMove,
  onArchive,
  pendingMove,
  disabled,
}: {
  card: PipelineCard;
} & Pick<Props, "onMove" | "onArchive" | "pendingMove" | "disabled">) {
  const prev = previousStatus(card.status);
  const next = nextStatus(card.status);
  const isPending =
    pendingMove?.clusterId === card.clusterId &&
    pendingMove?.to !== card.status;
  return (
    <footer className="flex items-center justify-between gap-1 border-line border-t bg-mist/50 px-3 py-2">
      <div className="flex items-center gap-1">
        <ArrowBtn
          busy={isPending && pendingMove?.to === prev}
          dir="back"
          disabled={disabled || !prev || isPending}
          onClick={() => prev && onMove(card.clusterId, prev)}
        />
        <ArrowBtn
          busy={isPending && pendingMove?.to === next}
          dir="forward"
          disabled={disabled || !next || isPending}
          onClick={() => next && onMove(card.clusterId, next)}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Card actions"
          className="flex size-8 items-center justify-center rounded-md text-slate hover:bg-mist disabled:opacity-50"
          disabled={disabled}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={2} />
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
    </footer>
  );
}

function ArrowBtn({
  dir,
  onClick,
  disabled,
  busy,
}: {
  dir: "back" | "forward";
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      aria-label={dir === "back" ? "Move back a stage" : "Move forward a stage"}
      className="flex size-8 items-center justify-center rounded-md text-slate hover:bg-mist disabled:opacity-30"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {busy ? (
        <HugeiconsIcon
          className="animate-spin"
          icon={Loading03Icon}
          size={14}
          strokeWidth={2}
        />
      ) : (
        <HugeiconsIcon
          icon={dir === "back" ? ArrowLeft01Icon : ArrowRight01Icon}
          size={14}
          strokeWidth={2}
        />
      )}
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
