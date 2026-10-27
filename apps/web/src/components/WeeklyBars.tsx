import { useId, useState } from "react";
import type { WeeklyPoint } from "../lib/adminAnalytics";

type Props = {
  /** Names what is plotted (single series, so no legend box). */
  title: string;
  points: WeeklyPoint[];
};

const W = 360;
const H = 120;
const PAD_TOP = 18;
const PAD_BOTTOM = 1;
const BAR_MAX = 18;

function weekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * 12-week column chart: one series in the accent, thin columns with a 4px rounded cap, a hairline
 * baseline, the latest value labelled, and a hover/focus tooltip on every week. A table copy of
 * the numbers sits behind it for screen readers.
 */
export function WeeklyBars({ title, points }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const max = Math.max(1, ...points.map((p) => p.value));
  const band = W / Math.max(points.length, 1);
  const bar = Math.min(BAR_MAX, band - 6);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const last = points.length - 1;
  const shown = active ?? null;

  return (
    <figure className="weekly-bars">
      <figcaption className="weekly-bars__title">{title}</figcaption>
      <div className="weekly-bars__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={tableId}>
          <line x1={0} x2={W} y1={H - PAD_BOTTOM} y2={H - PAD_BOTTOM} className="weekly-bars__axis" />
          {points.map((p, i) => {
            const cx = band * i + band / 2;
            const top = y(p.value);
            const h = H - PAD_BOTTOM - top;
            const r = Math.min(4, h / 2, bar / 2);
            const x = cx - bar / 2;
            const base = H - PAD_BOTTOM;
            // Rounded data-end, square at the baseline.
            const d =
              h <= 0
                ? ""
                : `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bar - r},${top} Q${x + bar},${top} ${x + bar},${top + r} L${x + bar},${base} Z`;
            return (
              <g key={p.weekStart}>
                {d ? <path d={d} className={`weekly-bars__bar${shown === i ? " is-active" : ""}`} /> : null}
                {/* Hit target: the whole week's band, larger than the mark. */}
                <rect
                  x={band * i}
                  y={0}
                  width={band}
                  height={H}
                  className="weekly-bars__hit"
                  tabIndex={0}
                  aria-label={`Week of ${weekLabel(p.weekStart)}: ${p.value}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
          {points.length > 0 && shown === null ? (
            <text x={band * last + band / 2} y={Math.max(10, y(points[last]!.value) - 5)} textAnchor="middle" className="weekly-bars__label">
              {points[last]!.value}
            </text>
          ) : null}
        </svg>
        {shown !== null && points[shown] ? (
          <div
            className="weekly-bars__tooltip"
            role="status"
            style={{ left: `${((band * shown + band / 2) / W) * 100}%` }}
          >
            <strong>{points[shown]!.value}</strong> · week of {weekLabel(points[shown]!.weekStart)}
          </div>
        ) : null}
      </div>
      <div className="weekly-bars__ticks" aria-hidden>
        <span>{points[0] ? weekLabel(points[0].weekStart) : ""}</span>
        <span>This week</span>
      </div>
      <table id={tableId} className="visually-hidden">
        <caption>{title}, last 12 weeks</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.weekStart}>
              <th scope="row">Week of {weekLabel(p.weekStart)}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
