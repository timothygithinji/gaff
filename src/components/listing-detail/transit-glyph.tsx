/**
 * Transit roundels for the "what's nearby" chips. When a station has been
 * matched to TfL StopPoint data we know its exact `modes`, so we render
 * the *correct* mark(s) per station: the Underground roundel, the orange
 * Overground roundel, the purple Elizabeth-line roundel, the turquoise
 * DLR roundel, the green Tram roundel, and the official National Rail
 * double-arrow. A station served by several modes shows several marks.
 *
 * When modes are missing (a bus, or a station outside TfL coverage) we
 * fall back to the coarse Google `kind`.
 *
 * The National Rail symbol path is the official artwork from Wikimedia
 * Commons (File:National_Rail_logo.svg — 62×39, two stroked paths); the
 * diagonals run past the viewBox and clip into the arrowheads. The
 * roundel family is a coloured ring + a horizontal bar (blue for the rail
 * modes, matching TfL's house style).
 */

const ROUNDEL_BAR = "#10069F";
const NR_RED = "#ED1C24";

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
  bus: { ring: "#DC241F", bar: "#DC241F", label: "Bus" },
};

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
 * The transit mark(s) for one place: one roundel per TfL mode, or the
 * coarse Google-kind fallback. Renders nothing for non-stations.
 */
export function StationGlyphs({ modes, kind, size = 14 }: Props) {
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
