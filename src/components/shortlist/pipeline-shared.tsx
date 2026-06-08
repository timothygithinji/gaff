/**
 * Shared vocabulary for the shortlist pipeline (kanban + mobile stage
 * list). Stage labels / count-pill colours, the relative-time helper,
 * and the small avatar stack all live here so the desktop board and the
 * mobile stacked-stage view stay in visual lockstep with Paper.
 */
import {
  Calendar03Icon,
  Note01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import type {
  PipelineArchivedReason,
  PipelineStatus,
} from "../../lib/pipeline-status";
import { propertyKindLabel } from "../../lib/property-kind";
import { cn } from "../../lib/utils";
import type {
  PipelineCard,
  PipelineColumns,
} from "../../server/functions/pipeline";

/** Long-form column / stage label (Paper). */
export const STAGE_LABEL: Record<PipelineStatus, string> = {
  shortlisted: "Both kept",
  contacted: "In conversation",
  viewing_booked: "Viewing booked",
  offer_made: "Offer placed",
  archived: "Archived",
};

/** Short label used where horizontal space is tight (chips). */
export const STAGE_SHORT: Record<PipelineStatus, string> = {
  shortlisted: "Both kept",
  contacted: "In convo",
  viewing_booked: "Viewing",
  offer_made: "Offer",
  archived: "Archived",
};

export const ARCHIVED_REASON_LABELS: Record<PipelineArchivedReason, string> = {
  accepted: "We took it",
  passed: "We passed",
  let_to_someone_else: "Let to someone else",
  withdrawn: "Listing withdrawn",
  other: "Other",
};

/** Count-pill tone per stage (Paper: copper for Viewing, navy for in-
 * convo / offer, hairline-bordered white otherwise). */
function countPillTone(status: PipelineStatus): string {
  if (status === "viewing_booked") {
    return "bg-[#d77a4a] text-[#eef1f4]";
  }
  if (status === "contacted" || status === "offer_made") {
    return "bg-[#0e2235] text-[#eef1f4]";
  }
  return "border border-line bg-card text-slate";
}

export function StageCountPill({
  status,
  count,
}: {
  status: PipelineStatus;
  count: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[11px] leading-[14px]",
        countPillTone(status)
      )}
    >
      {count}
    </span>
  );
}

export function totalPipelineCount(columns: PipelineColumns): number {
  return (
    columns.shortlisted.length +
    columns.contacted.length +
    columns.viewing_booked.length +
    columns.offer_made.length +
    columns.archived.length
  );
}

/* ---------------- Relative time (hydration-safe) ---------------- */

const WHITESPACE_RE = /\s+/;

export function firstNameOf(name: string): string {
  return (name || "").trim().split(WHITESPACE_RE)[0] || "them";
}

function relativeTime(date: Date): string {
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

/** Deterministic SSR string; swaps to a relative label after mount so
 * server and first client render agree (no hydration drift). */
function absoluteDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB");
}

/**
 * Returns the relative-time label for a pipeline card's last move,
 * including the mover's first name. Renders the absolute date on the
 * server / first paint, then the friendly relative string after mount.
 */
export function useAuditLine(card: PipelineCard): string {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const ago = mounted
    ? relativeTime(card.lastMovedAt)
    : absoluteDate(card.lastMovedAt);
  if (card.lastMovedBy) {
    return `${ago} · by ${firstNameOf(card.lastMovedBy.name)}`;
  }
  return ago;
}

/* ---------------- Viewing date ---------------- */

/** Default viewing length when none is set on the card. */
export const DEFAULT_VIEWING_DURATION_MINUTES = 30;

/** Friendly "Tue 10 Jun, 14:00" (en-GB, 24h). Timezone-sensitive, so
 * render it inside {@link ViewingChip} which holds it client-only. */
function formatViewingDate(date: Date): string {
  return new Date(date).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** UTC `YYYYMMDDTHHMMSSZ` stamp for a Google Calendar template URL. */
function gcalStamp(date: Date): string {
  return `${new Date(date).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Build a Google Calendar "create event" template URL for a viewing.
 * Start = the viewing date; end = start + `durationMinutes`. The address
 * seeds the title + location so the event is useful at a glance.
 */
export function buildGoogleCalendarUrl(opts: {
  address: string;
  start: Date;
  durationMinutes: number;
  details?: string;
}): string {
  const start = new Date(opts.start);
  const end = new Date(start.getTime() + opts.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Viewing — ${opts.address}`,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    location: opts.address,
  });
  if (opts.details) {
    params.set("details", opts.details);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Copper clock-pill showing a booked viewing's date+time. Client-only
 * (timezone-dependent formatting) so it can't drift the SSR hydration. */
export function ViewingChip({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-sm bg-[#d77a4a1a] px-2.5 py-1.5 text-[11px] text-navy leading-[14px]",
        className
      )}
    >
      <HugeiconsIcon
        className="shrink-0 text-[#d77a4a]"
        icon={Calendar03Icon}
        size={12}
        strokeWidth={1.5}
      />
      {mounted ? formatViewingDate(date) : "Viewing booked"}
    </span>
  );
}

/** Tiny "has notes" affordance — a note glyph, used on compact cards. */
export function NotesDot({ className }: { className?: string }) {
  return (
    <HugeiconsIcon
      aria-label="Has notes"
      className={cn("shrink-0 text-slate", className)}
      icon={Note01Icon}
      size={12}
      strokeWidth={1.5}
    />
  );
}

/* ---------------- Atoms ---------------- */

export function formatPrice(monthly: number | null): string {
  if (monthly === null) {
    return "—";
  }
  return `£${monthly.toLocaleString("en-GB")}`;
}

export function outcodeOf(postcode: string | null): string {
  if (!postcode) {
    return "";
  }
  const trimmed = postcode.trim().toUpperCase();
  const idx = trimmed.indexOf(" ");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}

export function metaLine(card: PipelineCard): string {
  const parts: string[] = [];
  const kind = propertyKindLabel(card.headline.propertyKind);
  if (kind) {
    parts.push(kind);
  }
  const outcode = outcodeOf(card.headline.postcode);
  if (outcode) {
    parts.push(outcode);
  }
  if (card.headline.bedrooms !== null) {
    parts.push(`${card.headline.bedrooms} bed`);
  }
  if (card.headline.bathrooms !== null) {
    parts.push(`${card.headline.bathrooms} bath`);
  }
  return parts.join(" · ");
}

/** Avatar stack — copper / navy chips with each member's initial. The
 * border colour adapts to the surface it sits on (navy badge vs white
 * card). Fixed-navy fills are pinned to literal hex. */
export function AvatarStack({
  members,
  border = "card",
}: {
  members: { userId: string; emailInitial: string }[];
  border?: "card" | "navy";
}) {
  const borderClass = border === "navy" ? "border-[#0e2235]" : "border-white";
  return (
    <span className="flex items-center">
      {members.slice(0, 4).map((m, idx) => (
        <span
          className={cn(
            "-ml-1.5 flex size-3.5 items-center justify-center rounded-full border-[1.5px] font-semibold text-[8px] text-white leading-[10px] first:ml-0",
            borderClass,
            idx % 2 === 0 ? "bg-[#1f3a5f]" : "bg-[#d77a4a]"
          )}
          key={m.userId}
        >
          {m.emailInitial}
        </span>
      ))}
    </span>
  );
}
