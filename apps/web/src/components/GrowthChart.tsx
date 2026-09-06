import type { GrowthEntryDto } from "@kidcom/shared";

// Inline SVG line chart matching the layout of
// docs/stitch_splitkid/growth_charts/code.html's "Height Chart" card, but
// plotting the child's own logged GrowthEntry rows instead of a fabricated
// line. No WHO percentile shading — see the chunk 3 plan's scope note: that
// needs real WHO LMS reference tables, which aren't sourced yet.
export function GrowthChart({
  entries,
  metric,
}: {
  entries: GrowthEntryDto[];
  metric: "height" | "weight";
}) {
  const points = entries
    .map((e) => ({
      date: new Date(e.measuredAt),
      value: metric === "height" ? e.heightCm : e.weightKg,
    }))
    .filter((p): p is { date: Date; value: number } => p.value !== null && p.value !== undefined);

  if (points.length === 0) {
    return (
      <div className="p-4 h-64 w-full bg-surface-beige/30 flex items-center justify-center">
        <p className="font-body-md text-body-md text-on-surface-variant text-center">
          Log a measurement to see the chart.
        </p>
      </div>
    );
  }

  const singlePoint = points.length === 1;

  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();
  const timeSpan = maxTime - minTime || 1;

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueSpan = maxValue - minValue || 1;

  const height = 150;
  const padding = 15;
  // Give the chart more horizontal room as points pile up (roughly one
  // "comfortable" slot per point) instead of cramming everything into a
  // fixed width — the wrapper below scrolls once this exceeds its box.
  const width = Math.max(300, points.length * 40);

  function toXY(p: { date: Date; value: number }) {
    const x = singlePoint
      ? width / 2
      : padding + ((p.date.getTime() - minTime) / timeSpan) * (width - padding * 2);
    const y =
      height -
      padding -
      ((p.value - minValue) / valueSpan) * (height - padding * 2);
    return { x, y };
  }

  const coords = points.map(toXY);
  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];
  const lastCoord = coords[coords.length - 1];
  const unit = metric === "height" ? "cm" : "kg";

  // The value badge is positioned as a percentage of the chart box, derived
  // from the last point's actual SVG coordinates rather than a hardcoded
  // top/right corner — so with one point (dead center) it sits over that
  // point instead of floating in an unrelated corner.
  const badgeLeftPct = Math.min(92, Math.max(8, (lastCoord.x / width) * 100));
  const badgeTopPct = Math.min(85, Math.max(5, (lastCoord.y / height) * 100 - 12));

  return (
    <div className="p-4 h-64 w-full bg-surface-beige/30 overflow-x-auto">
      <div className="relative h-full" style={{ width, minWidth: "100%" }}>
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          <line stroke="#e1e3dd" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.8} y2={height * 0.8} />
          <line stroke="#e1e3dd" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.6} y2={height * 0.6} />
          <line stroke="#e1e3dd" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.4} y2={height * 0.4} />
          <line stroke="#e1e3dd" strokeDasharray="4" strokeWidth="1" x1="0" x2={width} y1={height * 0.2} y2={height * 0.2} />

          <path d={linePath} fill="none" stroke="#326943" strokeLinecap="round" strokeWidth="3" />

          {coords.slice(0, -1).map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} fill="#ffffff" r="4" stroke="#326943" strokeWidth="2" />
          ))}
          <circle cx={lastCoord.x} cy={lastCoord.y} fill="#326943" r="6" stroke="#ffffff" strokeWidth="2" />

          {singlePoint ? (
            <text
              fill="#717970"
              fontFamily="Plus Jakarta Sans"
              fontSize="10"
              x={width / 2}
              y={height - 5}
              textAnchor="middle"
            >
              {points[0].date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
            </text>
          ) : (
            <>
              <text fill="#717970" fontFamily="Plus Jakarta Sans" fontSize="10" x={0} y={height - 5}>
                {points[0].date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
              </text>
              <text fill="#717970" fontFamily="Plus Jakarta Sans" fontSize="10" x={width - 60} y={height - 5}>
                {last.date.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
              </text>
            </>
          )}
        </svg>
        <div
          className="absolute bg-text-main text-surface-container-lowest px-2 py-1 rounded-lg shadow-md font-label-sm"
          style={{ left: `${badgeLeftPct}%`, top: `${badgeTopPct}%` }}
        >
          {last.value}
          {unit}
        </div>
      </div>
    </div>
  );
}
