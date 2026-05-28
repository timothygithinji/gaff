/**
 * Derive a small set of UI-facing badges from already-parsed listing
 * metadata (portal `tags[]` + a "first listed" date). Lives outside the
 * portal parsers because it's a presentation decision: which signals
 * matter on the swipe card vs. the noise we drop on the floor.
 *
 * Inputs come from two places:
 *   - `listings.publishedAt` — portal's own "first listed" date. Used
 *     directly for the "listed N days ago" line and to derive the
 *     "Just listed" / "N days on market" badges.
 *   - `listings.rawJson.tags[]` — free-form strings off the portal's
 *     listing card (e.g. "Reduced", "Just added", "Available from 1
 *     June 2026", "House share", "Student friendly", "Furnished").
 *     We pattern-match a fixed allowlist; anything else is ignored to
 *     keep the card legible.
 */

export type ListingMetaBadge = {
  key: string;
  label: string;
  variant: "fresh" | "info" | "caution" | "problem";
};

const REDUCED_RE = /reduce/i;
const JUST_RE = /just\s*(added|listed)/i;
const SHARE_RE = /house\s*share|room\s+in/i;
const STUDENT_RE = /student/i;
const AVAIL_IMMED_RE = /available\s+(immediately|now)/i;
const AVAIL_FROM_RE = /available\s+from\s+(.+)/i;

const MONTH_SHORT: Record<string, string> = {
  january: "Jan",
  february: "Feb",
  march: "Mar",
  april: "Apr",
  may: "May",
  june: "Jun",
  july: "Jul",
  august: "Aug",
  september: "Sep",
  october: "Oct",
  november: "Nov",
  december: "Dec",
};

function shortenAvailability(raw: string): string {
  // Portal tags are like "Available from 1 June 2026"; the regex hands us
  // "1 June 2026". Collapse to "Avail 1 Jun" — the year is almost always
  // current and steals space; the day+month is what matters.
  const parts = raw.trim().split(/\s+/);
  const day = parts[0];
  const monthRaw = parts[1]?.toLowerCase();
  const monthShort = monthRaw ? MONTH_SHORT[monthRaw] : undefined;
  if (day && monthShort) {
    return `Avail ${day} ${monthShort}`;
  }
  return `Avail ${raw.trim()}`;
}

/** Whole days between `date` and now, clamped to ≥0. `null` if no date. */
export function daysSince(
  date: Date | string | null | undefined
): number | null {
  if (!date) {
    return null;
  }
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(t)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

/**
 * Human-readable "listed N ago" string for the card sub-line.
 * Returns null when we don't have a date — caller decides whether to
 * suppress the sub-line entirely or fall back to a sibling phrase.
 */
export function formatDaysListed(days: number | null): string | null {
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return "Listed today";
  }
  if (days === 1) {
    return "Listed 1 day ago";
  }
  if (days < 7) {
    return `Listed ${days} days ago`;
  }
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "Listed 1 week ago" : `Listed ${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "Listed 1 month ago" : `Listed ${months} months ago`;
  }
  return "Listed 1+ year ago";
}

export function deriveListingMetaBadges(opts: {
  tags: string[] | null | undefined;
  daysListed: number | null;
}): ListingMetaBadge[] {
  const out: ListingMetaBadge[] = [];
  const seen = new Set<string>();
  const push = (b: ListingMetaBadge): void => {
    if (!seen.has(b.key)) {
      out.push(b);
      seen.add(b.key);
    }
  };

  // Freshness/staleness — derived from the date, not the tags, so we
  // get a useful signal even for portals that don't tag "Just added".
  if (opts.daysListed !== null) {
    if (opts.daysListed <= 3) {
      push({ key: "fresh", label: "Just listed", variant: "fresh" });
    } else if (opts.daysListed >= 60) {
      push({
        key: "stale",
        label: `${opts.daysListed} days on market`,
        variant: "caution",
      });
    }
  }

  for (const raw of opts.tags ?? []) {
    if (REDUCED_RE.test(raw)) {
      push({ key: "reduced", label: "Reduced", variant: "fresh" });
    } else if (SHARE_RE.test(raw)) {
      push({ key: "share", label: "House share", variant: "problem" });
    } else if (STUDENT_RE.test(raw)) {
      push({ key: "student", label: "Student let", variant: "caution" });
    } else if (JUST_RE.test(raw)) {
      push({ key: "fresh", label: "Just listed", variant: "fresh" });
    } else if (AVAIL_IMMED_RE.test(raw)) {
      push({ key: "avail", label: "Available now", variant: "info" });
    } else {
      const m = raw.match(AVAIL_FROM_RE);
      if (m?.[1]) {
        push({
          key: "avail",
          label: shortenAvailability(m[1]),
          variant: "info",
        });
      }
    }
  }

  return out;
}
