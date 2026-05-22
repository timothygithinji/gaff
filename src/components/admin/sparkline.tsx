/**
 * Pure SVG sparkline. No chart lib — the path is a hand-rolled
 * polyline over the input array (oldest → newest), scaled to the
 * supplied width/height. Empty / all-zero inputs render a flat line at
 * the bottom so the card never collapses on a quiet day.
 */
type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
};

export function Sparkline({
  data,
  width = 160,
  height = 36,
  stroke = "var(--primary)",
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg aria-hidden height={height} role="presentation" width={width} />
    );
  }
  const max = Math.max(...data, 0.0001);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M${points.join(" L")}`;
  return (
    <svg
      aria-hidden
      fill="none"
      height={height}
      role="presentation"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <path d={d} stroke={stroke} strokeLinecap="round" strokeWidth={1.5} />
    </svg>
  );
}
