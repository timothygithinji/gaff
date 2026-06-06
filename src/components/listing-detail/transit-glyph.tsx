/**
 * Transit marks + line/route labels for the "what's nearby" chips.
 *
 * When a station has been matched to TfL StopPoint data we know its exact
 * `modes`, so we render the *correct* mark(s) per station: the red
 * Underground roundel, the orange Overground roundel, the purple
 * Elizabeth-line roundel, the turquoise DLR roundel, the green Tram
 * roundel, and the official red National Rail double-arrow. A bus gets a
 * red bus badge rather than a roundel so it reads as a bus at a glance. A
 * station served by several modes shows several marks.
 *
 * When modes are missing (a bus, or a station outside TfL coverage) we
 * fall back to the coarse Google `kind`.
 *
 * Alongside the mark we surface the *lines* serving the place — tube line
 * names tinted to their official colour ("Piccadilly"), the train operator
 * for National Rail ("Great Northern"), and bus route numbers ("34",
 * "232") in red TfL-bus pills — so it's clear which services actually call
 * there, not just that "a station" is nearby.
 *
 * The National Rail symbol path is the official artwork from Wikimedia
 * Commons (File:National_Rail_logo.svg — 62×39, two stroked paths); the
 * diagonals run past the viewBox and clip into the arrowheads. The
 * roundel family is a coloured ring + a horizontal bar (blue for the rail
 * modes, matching TfL's house style).
 */

import { Bus01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ROUNDEL_BAR = "#10069F";
const NR_RED = "#ED1C24";
const TFL_BUS_RED = "#E1251B";

type RoundelSpec = { ring: string; bar: string; label: string };

/** Ring colour + label per TfL mode (National Rail handled separately). */
const MODE_ROUNDEL: Record<string, RoundelSpec> = {
  tube: { ring: "#DC241F", bar: ROUNDEL_BAR, label: "Underground" },
  overground: { ring: "#EE7C0E", bar: ROUNDEL_BAR, label: "Overground" },
  "elizabeth-line": { ring: "#6950A1", bar: ROUNDEL_BAR, label: "Elizabeth line" },
  dlr: { ring: "#00AFAD", bar: ROUNDEL_BAR, label: "DLR" },
  tram: { ring: "#5FB728", bar: ROUNDEL_BAR, label: "Tram" },
};

/** Coarse Google-kind fallback when TfL modes are unknown. */
const KIND_ROUNDEL: Record<string, RoundelSpec> = {
  tube: { ring: "#DC241F", bar: ROUNDEL_BAR, label: "Underground" },
  tram: { ring: "#5FB728", bar: ROUNDEL_BAR, label: "Tram" },
};

/**
 * Official tube line colours, keyed by lowercased line name. Used to tint
 * the line pills so "Victoria" reads in its real light-blue, etc. Lines
 * not listed (National Rail operators, the newer Overground line names)
 * fall back to a neutral pill.
 */
const TUBE_LINE_COLOR: Record<string, string> = {
  bakerloo: "#B36305",
  central: "#E32017",
  circle: "#FFD300",
  district: "#00782A",
  "hammersmith & city": "#F3A9BB",
  jubilee: "#A0A5A9",
  metropolitan: "#9B0056",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#0098D4",
  "waterloo & city": "#95CDBA",
  "elizabeth": "#6950A1",
  dlr: "#00AFAD",
  tram: "#5FB728",
};

/** White-on-colour reads poorly on the few pale tube lines. */
const PALE_LINE = new Set(["circle", "hammersmith & city", "waterloo & city"]);

function Roundel({ ring, bar, label, size }: RoundelSpec & { size: number }) {
  return (
    <svg
      aria-hidden
      focusable={false}
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <title>{label}</title>
      <circle
        cx="12"
        cy="12"
        fill="none"
        r="8"
        stroke={ring}
        strokeWidth="3.5"
      />
      <rect fill={bar} height="5" width="21" x="1.5" y="9.5" />
    </svg>
  );
}

function NationalRailArrow({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      fill="none"
      focusable={false}
      height={size}
      stroke={NR_RED}
      viewBox="0 0 62 39"
      width={Math.round(size * 1.59)}
    >
      <title>National Rail</title>
      <path d="M1,-8.9 46,12.4 16,26.6 61,47.9" strokeWidth="6" />
      <path d="M0,12.4H62m0,14.2H0" strokeWidth="6.4" />
    </svg>
  );
}

/** A red TfL-bus badge — distinct from the rail roundels at a glance. */
function BusBadge({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
      style={{ width: size, height: size, backgroundColor: TFL_BUS_RED }}
      title="Bus"
    >
      <HugeiconsIcon
        color="#fff"
        icon={Bus01Icon}
        size={Math.round(size * 0.72)}
        strokeWidth={2}
      />
    </span>
  );
}

function ModeGlyph({ mode, size }: { mode: string; size: number }) {
  if (mode === "national-rail") {
    return <NationalRailArrow size={size} />;
  }
  const spec = MODE_ROUNDEL[mode];
  return spec ? <Roundel {...spec} size={size} /> : null;
}

type Props = {
  /** TfL modes serving the station (preferred). */
  modes?: readonly string[];
  /** Coarse Google kind, used only when `modes` is absent. */
  kind?: string | null;
  size?: number;
};

/**
 * The transit mark(s) for one place: one roundel per TfL mode, a bus badge
 * for buses, or the coarse Google-kind fallback. Renders nothing for
 * non-stations.
 */
export function StationGlyphs({ modes, kind, size = 14 }: Props) {
  if (kind === "bus") {
    return <BusBadge size={size} />;
  }
  const known = (modes ?? []).filter(
    (m) => m === "national-rail" || m in MODE_ROUNDEL
  );
  if (known.length > 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        {known.map((m) => (
          <ModeGlyph key={m} mode={m} size={size} />
        ))}
      </span>
    );
  }
  if (!kind) {
    return null;
  }
  if (kind === "rail") {
    return <NationalRailArrow size={size} />;
  }
  const spec = KIND_ROUNDEL[kind];
  return spec ? <Roundel {...spec} size={size} /> : null;
}

/** A single line / route pill. Tube lines tint to their colour; bus routes
 * use the TfL bus red; everything else is a neutral operator pill. */
function LinePill({ line, isBus }: { line: string; isBus: boolean }) {
  const key = line.toLowerCase();
  if (isBus) {
    return (
      <span
        className="rounded-[3px] px-1 py-px font-semibold text-[10px] text-white leading-none"
        style={{ backgroundColor: TFL_BUS_RED }}
      >
        {line}
      </span>
    );
  }
  const color = TUBE_LINE_COLOR[key];
  if (color) {
    return (
      <span
        className="rounded-[3px] px-1.5 py-px font-medium text-[10px] leading-none"
        style={{
          backgroundColor: color,
          color: PALE_LINE.has(key) ? "#10069F" : "#fff",
        }}
      >
        {line}
      </span>
    );
  }
  return (
    <span className="rounded-[3px] border border-line bg-mist px-1.5 py-px font-medium text-[10px] text-slate leading-none">
      {line}
    </span>
  );
}

/**
 * The lines / routes serving a place, as small pills: bus route numbers in
 * red, tube lines in their official colour, operators (National Rail,
 * newer Overground lines) as neutral pills. Caps at `max` with a "+N".
 */
export function TransitLines({
  lines,
  kind,
  max = 6,
}: {
  lines: readonly string[] | undefined;
  kind?: string | null;
  max?: number;
}) {
  if (!lines || lines.length === 0) {
    return null;
  }
  const isBus = kind === "bus";
  const shown = lines.slice(0, max);
  const hidden = lines.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((line) => (
        <LinePill isBus={isBus} key={line} line={line} />
      ))}
      {hidden > 0 ? (
        <span className="font-medium text-[10px] text-slate-2 leading-none">
          +{hidden}
        </span>
      ) : null}
    </span>
  );
}
