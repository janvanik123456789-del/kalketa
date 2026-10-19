/**
 * A surface z(x, y) seen in 3D (kind "surface"): the cells of its grid as shaded patches, drawn from the
 * back to the front, inside a box whose back walls and floor carry the grid and whose front edges carry
 * the ticks; the colour bar at the right as in the map. The view (azimuth, elevation) is the chart's own:
 * dragged in the editor, written into its line, the same in print.
 */

import { niceScale, type ChartLayout, type ChartSpec } from './chart.js';
import { cellOutline, colorBar, colormapOf, edgeLookup, esc, painter, surfaceLevels, surfaceRange, type Colormap } from './surface.js';

/** How a surface is seen: turned round the vertical axis by az, looked at from el above the floor (degrees). */
export interface SurfaceView {
  readonly az: number;
  readonly el: number;
}

export const DEFAULT_VIEW: SurfaceView = { az: 35, el: 30 };

/** "az=35 el=30" read; parts missing or wrong are as usual. */
export function parseView(text: string | undefined): SurfaceView {
  const az = Number(/\baz\s*=\s*(-?[\d.]+)/.exec(text ?? '')?.[1]);
  const el = Number(/\bel\s*=\s*(-?[\d.]+)/.exec(text ?? '')?.[1]);
  return { az: Number.isFinite(az) ? ((((az + 180) % 360) + 360) % 360) - 180 : DEFAULT_VIEW.az, el: Number.isFinite(el) ? Math.max(0, Math.min(90, el)) : DEFAULT_VIEW.el };
}

export function viewText(view: SurfaceView): string {
  return `az=${Math.round(view.az)} el=${Math.round(view.el)}`;
}

const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const WALL = '#f7f7f4';
const r = (v: number) => Math.round(v * 100) / 100;

type Point3 = readonly [number, number, number];

/** The surface in 3D: shaded cells, the box with its grid and ticks, the colour bar. */
export function surface3dSvg(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string, formatX: (value: number) => string, asked: Colormap, font: number, equalScale: boolean): string {
  const surface = spec.surface;
  if (!surface) return '';
  const { xs, ys, z } = surface;
  const view = surface.view ?? DEFAULT_VIEW;
  const [lo, hi] = surfaceRange(surface);
  const map = colormapOf(surface, asked);
  const paint = painter(map, lo, hi);
  const [x0, x1, y0, y1] = [xs[0]!, xs[xs.length - 1]!, ys[0]!, ys[ys.length - 1]!];
  // The box: x and y to ±1 (at one scale when they share a unit), z to ±0.6 of the wider side.
  const [wx, wy] = equalScale ? [(x1 - x0) / Math.max(x1 - x0, y1 - y0), (y1 - y0) / Math.max(x1 - x0, y1 - y0)] : [1, 1];
  const zh = 0.62;
  const X = (x: number) => wx * ((2 * (x - x0)) / (x1 - x0) - 1);
  const Y = (y: number) => wy * ((2 * (y - y0)) / (y1 - y0) - 1);
  const Z = (v: number) => zh * (hi > lo ? (2 * (v - lo)) / (hi - lo) - 1 : 0);
  const [az, el] = [(view.az * Math.PI) / 180, (view.el * Math.PI) / 180];
  // Turned round z by az, then tilted by el: u to the right, v up on the paper, depth away from the eye.
  const turn = ([px, py, pz]: Point3) => {
    const a = px * Math.cos(az) - py * Math.sin(az);
    const b = px * Math.sin(az) + py * Math.cos(az);
    return { u: a, v: pz * Math.cos(el) + b * Math.sin(el), depth: b * Math.cos(el) - pz * Math.sin(el) };
  };
  // The box fitted into the plot area.
  const corners: Point3[] = [];
  for (const cx of [-wx, wx]) for (const cy of [-wy, wy]) for (const cz of [-zh, zh]) corners.push([cx, cy, cz]);
  const seen = corners.map(turn);
  const [uMin, uMax] = [Math.min(...seen.map((p) => p.u)), Math.max(...seen.map((p) => p.u))];
  const [vMin, vMax] = [Math.min(...seen.map((p) => p.v)), Math.max(...seen.map((p) => p.v))];
  const { plot } = layout;
  // Room round the box for the ticks and the titles of the axes.
  const pad = font * 3.2;
  const k = Math.min((plot.right - plot.left - 2 * pad) / (uMax - uMin || 1), (plot.bottom - plot.top - 2 * pad) / (vMax - vMin || 1));
  const cx = (plot.left + plot.right) / 2 - ((uMin + uMax) / 2) * k;
  const cy = (plot.top + plot.bottom) / 2 + ((vMin + vMax) / 2) * k;
  const screen = (p: Point3): [number, number] => {
    const t = turn(p);
    return [cx + t.u * k, cy - t.v * k];
  };
  const depthOf = (p: Point3) => turn(p).depth;
  const path = (points: readonly Point3[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(screen(p)[0])} ${r(screen(p)[1])}`).join('') + 'Z';

  // The walls at the back and the floor, with the grid of the ticks.
  const xTicks = niceScale(x0, x1, 6).ticks.filter((t) => t >= x0 - 1e-9 * (x1 - x0) && t <= x1 + 1e-9 * (x1 - x0));
  const yTicks = niceScale(y0, y1, 6).ticks.filter((t) => t >= y0 - 1e-9 * (y1 - y0) && t <= y1 + 1e-9 * (y1 - y0));
  const zTicks = niceScale(lo, hi, 5).ticks.filter((t) => t >= lo - 1e-9 * (hi - lo) && t <= hi + 1e-9 * (hi - lo));
  const backX = depthOf([wx, 0, 0]) > depthOf([-wx, 0, 0]) ? wx : -wx;
  const backY = depthOf([0, wy, 0]) > depthOf([0, -wy, 0]) ? wy : -wy;
  const line = (a: Point3, b: Point3, stroke = GRID, width = 0.8) => {
    const [p, q] = [screen(a), screen(b)];
    return `<line x1="${r(p[0])}" y1="${r(p[1])}" x2="${r(q[0])}" y2="${r(q[1])}" stroke="${stroke}" stroke-width="${width}"/>`;
  };
  const back: string[] = [];
  back.push(`<path d="${path([[-wx, -wy, -zh], [wx, -wy, -zh], [wx, wy, -zh], [-wx, wy, -zh]])}" fill="${WALL}" stroke="${MUTED}" stroke-width="0.6"/>`);
  back.push(`<path d="${path([[backX, -wy, -zh], [backX, wy, -zh], [backX, wy, zh], [backX, -wy, zh]])}" fill="${WALL}" stroke="${MUTED}" stroke-width="0.6"/>`);
  back.push(`<path d="${path([[-wx, backY, -zh], [wx, backY, -zh], [wx, backY, zh], [-wx, backY, zh]])}" fill="${WALL}" stroke="${MUTED}" stroke-width="0.6"/>`);
  for (const t of xTicks) back.push(line([X(t), -wy, -zh], [X(t), wy, -zh]), line([X(t), backY, -zh], [X(t), backY, zh]));
  for (const t of yTicks) back.push(line([-wx, Y(t), -zh], [wx, Y(t), -zh]), line([backX, Y(t), -zh], [backX, Y(t), zh]));
  for (const t of zTicks) back.push(line([backX, -wy, Z(t)], [backX, wy, Z(t)]), line([-wx, backY, Z(t)], [wx, backY, Z(t)]));

  // The cells, the farthest first; each shaded by how it faces the light (from the upper left, behind the eye).
  const light = (() => {
    const l = [-0.45, 0.65, -0.62];
    const n = Math.hypot(...l);
    return l.map((v) => v / n) as [number, number, number];
  })();
  const cells: { depth: number; d: string; fill: string }[] = [];
  const edgeAt = edgeLookup(surface);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const values = [z[i]![j]!, z[i + 1]![j]!, z[i + 1]![j + 1]!, z[i]![j + 1]!];
      // A cell on the edge of the surface: only its part with values, up to the edge found between the points.
      const outline = values.every(Number.isFinite)
        ? [
            { fx: 0, fy: 0, z: values[0]! },
            { fx: 1, fy: 0, z: values[1]! },
            { fx: 1, fy: 1, z: values[2]! },
            { fx: 0, fy: 1, z: values[3]! },
          ]
        : surface.edges
          ? cellOutline(surface, i, j, edgeAt)
          : undefined;
      if (!outline) continue;
      const points: Point3[] = outline.map((o) => [X(xs[i]! + (xs[i + 1]! - xs[i]!) * o.fx), Y(ys[j]! + (ys[j + 1]! - ys[j]!) * o.fy), Z(o.z)]);
      const t = points.map(turn);
      // The normal of the patch as seen (Newell's method: any polygon, not only four corners).
      const n: [number, number, number] = [0, 0, 0];
      t.forEach((a, k) => {
        const b = t[(k + 1) % t.length]!;
        n[0] += (a.v - b.v) * (a.depth + b.depth);
        n[1] += (a.depth - b.depth) * (a.u + b.u);
        n[2] += (a.u - b.u) * (a.v + b.v);
      });
      const len = Math.hypot(...n) || 1;
      const facing = Math.abs((n[0]! * light[0] + n[1]! * light[1] + n[2]! * light[2]) / len);
      const shade = 0.55 + 0.45 * facing;
      const [red, green, blue] = paint(outline.reduce((s, o) => s + o.z, 0) / outline.length).map((c) => Math.round(Math.min(255, c * shade)));
      const fill = `#${[red, green, blue].map((c) => c!.toString(16).padStart(2, '0')).join('')}`;
      cells.push({ depth: t.reduce((s, p) => s + p.depth, 0) / t.length, d: path(points), fill });
    }
  }
  cells.sort((a, b) => b.depth - a.depth);
  // A cell's edge in its own colour closes the hairline gaps between cells; a darker one draws the mesh.
  const mesh = xs.length <= 41 && ys.length <= 41;
  const patches = cells.map((c) => `<path d="${c.d}" fill="${c.fill}" stroke="${mesh ? '#00000040' : c.fill}" stroke-width="${mesh ? 0.35 : 0.5}" stroke-linejoin="round"/>`).join('');

  // The ticks on the front edges of the floor and on the vertical edge at the left.
  const frontX = -backX;
  const frontY = -backY;
  const middle = screen([0, 0, -zh]);
  const label = (p: Point3, text: string, along: Point3) => {
    // Away from the middle of the floor, past the edge.
    const [sx, sy] = screen(p);
    const [ax, ay] = screen(along);
    let [dx, dy] = [ax - middle[0], ay - middle[1]];
    const n = Math.hypot(dx, dy) || 1;
    [dx, dy] = [dx / n, dy / n];
    const x = sx + dx * font * 1.3;
    const y = sy + dy * font * 1.3 + font * 0.35;
    const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
    return `<text x="${r(x)}" y="${r(y)}" text-anchor="${anchor}" fill="${MUTED}">${esc(text)}</text>`;
  };
  const ticks: string[] = [];
  for (const t of xTicks) ticks.push(label([X(t), frontY, -zh], formatX(t), [0, frontY, -zh]));
  for (const t of yTicks) ticks.push(label([frontX, Y(t), -zh], format(t), [frontX, 0, -zh]));
  // The vertical edge: of the four, the one farthest left on the paper.
  const edges: [number, number][] = [[-wx, -wy], [wx, -wy], [wx, wy], [-wx, wy]];
  const [ex, ey] = edges.reduce((best, e) => (screen([e[0], e[1], 0])[0] < screen([best[0], best[1], 0])[0] ? e : best));
  ticks.push(line([ex, ey, -zh], [ex, ey, zh], MUTED, 0.6));
  for (const t of zTicks) {
    const [sx, sy] = screen([ex, ey, Z(t)]);
    ticks.push(`<line x1="${r(sx - 3)}" y1="${r(sy)}" x2="${r(sx)}" y2="${r(sy)}" stroke="${MUTED}"/><text x="${r(sx - 5)}" y="${r(sy + font * 0.35)}" text-anchor="end" fill="${MUTED}">${format(t)}</text>`);
  }
  // The titles of the axes, past the middle of their ticks.
  const title = (p: Point3, along: Point3, text: string) => {
    if (!text) return '';
    const [sx, sy] = screen(p);
    const [ax, ay] = screen(along);
    let [dx, dy] = [ax - middle[0], ay - middle[1]];
    const n = Math.hypot(dx, dy) || 1;
    [dx, dy] = [dx / n, dy / n];
    return `<text x="${r(sx + dx * font * 3)}" y="${r(sy + dy * font * 3 + font * 0.35)}" text-anchor="middle" fill="${INK_2}">${esc(text)}</text>`;
  };
  ticks.push(title([0, frontY, -zh], [0, frontY, -zh], spec.xTitle), title([frontX, 0, -zh], [frontX, 0, -zh], spec.yTitle));

  // The highest and the lowest point: a diamond on the surface, its value beside it.
  const marks = (surface.extremes ?? [])
    .map((e, i) => {
      const [px, py] = screen([X(e.x), Y(e.y), Z(e.z)]);
      return `<path class="chart-extreme" d="M${r(px)} ${r(py - 6)}L${r(px + 6)} ${r(py)}L${r(px)} ${r(py + 6)}L${r(px - 6)} ${r(py)}Z" fill="${e.peak ? INK : '#fff'}" stroke="${e.peak ? '#fff' : INK}" stroke-width="1.5"/><text data-label="e0.${i}" class="chart-label chart-extreme-label" x="${r(px)}" y="${r(py - 10)}" text-anchor="middle" fill="${INK}" font-weight="600" stroke="#fff" stroke-width="3" paint-order="stroke">${format(e.z)}</text>`;
    })
    .join('');
  // The colour bar beside the box, not at the far edge of the chart.
  const boxRight = Math.max(...corners.map((c) => screen(c)[0]));
  const barLayout = { ...layout, plot: { ...plot, right: Math.min(plot.right, boxRight + pad + 10) } };
  const bar = colorBar(surface, barLayout, format, map, paint, surfaceLevels(surface), font);
  // The cut as a line on the surface, the points of the sheet on it.
  const cut = surface.cut;
  const cutLine = cut
    ? `<path class="chart-cut-line" d="${cut.along
        .map((a, k) => [cut.axis === 'x' ? X(cut.at) : X(a), cut.axis === 'x' ? Y(a) : Y(cut.at), cut.z[k]!] as const)
        .filter(([, , v]) => Number.isFinite(v))
        .map(([px, py, v], k) => {
          const [sx, sy] = screen([px, py, Z(v)]);
          return `${k === 0 ? 'M' : 'L'}${r(sx)} ${r(sy)}`;
        })
        .join('')}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-dasharray="8 3 2 3"/>`
    : '';
  const sheetPoints = (surface.points ?? [])
    .filter((p) => Number.isFinite(p.z))
    .map((p, k) => {
      const [px, py] = screen([X(p.x), Y(p.y), Z(p.z)]);
      return `<circle class="chart-point" cx="${r(px)}" cy="${r(py)}" r="4.5" fill="${INK}" stroke="#fff" stroke-width="1.5"/><text data-label="p0.${k}" class="chart-label chart-point-label" x="${r(px + 8)}" y="${r(py - 8)}" fill="${INK}" stroke="#fff" stroke-width="3" paint-order="stroke">${format(p.z)}</text>`;
    })
    .join('');
  return `<g class="chart-box">${back.join('')}</g><g class="chart-surface">${patches}</g><g class="chart-ticks">${ticks.join('')}</g>${cutLine}${marks}${sheetPoints}${bar}`;
}
