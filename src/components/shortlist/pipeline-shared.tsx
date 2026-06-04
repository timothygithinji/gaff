/**
 * Shared vocabulary for the shortlist pipeline (kanban + mobile stage
 * list). Stage labels / count-pill colours, the relative-time helper,
 * and the small avatar stack all live here so the desktop board and the
 * mobile stacked-stage view stay in visual lockstep with Paper.
 */
import { useEffect, useState } from "react";
import type {
  PipelineArchivedReason,
  PipelineStatus,
} from "../../lib/pipeline-status";
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
