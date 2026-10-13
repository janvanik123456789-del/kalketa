/**
 * Where the point of a tangent goes when it is dragged: on the curve at the x of
 * the pointer, as along the graph of a function; where the curve is out of the
 * chart there (beyond the y axis set by hand), the nearest place of it inside.
 */

import { xPosition, xValueAt, yPosition, type ChartLayout, type ChartSpec } from '@kalketa/chart';

/**
 * The x of the point of the first curve for a pointer at (px, py) in the units of the chart:
 * the x of the pointer (kept to the x axis) where the curve is inside the plot, else the
 * place of the curve inside the plot nearest the pointer; undefined for no position.
 */
export function nearestOnCurve(chart: { readonly spec: ChartSpec; readonly layout: ChartLayout }, px: number, py: number): number | undefined {
  const s = chart.spec.series[0];
  if (!s || !Number.isFinite(px) || !Number.isFinite(py)) return undefined;
  const { layout } = chart;
  const inside = (y: number) => Number.isFinite(y) && y >= layout.y.min && y <= layout.y.max;
  // The curve at the x of the pointer, between the samples around it.
  const x = Math.min(layout.x.max, Math.max(layout.x.min, xValueAt(layout, Math.min(layout.plot.right, Math.max(layout.plot.left, px)))));
  const j = s.xs.findIndex((v, k) => k + 1 < s.xs.length && v <= x && x <= s.xs[k + 1]!);
  if (j >= 0) {
    const t = (x - s.xs[j]!) / (s.xs[j + 1]! - s.xs[j]! || 1);
    if (inside(s.ys[j]! + t * (s.ys[j + 1]! - s.ys[j]!))) return x;
  }
  // Out of the chart there: the place of the curve inside it nearest the pointer.
  let best: { x: number; d: number } | undefined;
  for (let k = 0; k + 1 < s.xs.length; k++) {
    const [y1, y2] = [s.ys[k]!, s.ys[k + 1]!];
    if (!inside(y1) || !inside(y2)) continue;
    const [ax, ay, bx, by] = [xPosition(layout, s.xs[k]!), yPosition(layout, y1), xPosition(layout, s.xs[k + 1]!), yPosition(layout, y2)];
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len > 0 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len)) : 0;
    const d = Math.hypot(ax + t * (bx - ax) - px, ay + t * (by - ay) - py);
    if (Number.isFinite(d) && (!best || d < best.d)) best = { x: s.xs[k]! + t * (s.xs[k + 1]! - s.xs[k]!), d };
  }
  return best?.x;
}
