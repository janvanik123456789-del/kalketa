/**
 * A surface z(x, y) drawn flat, as a map: the plot area in colours of z, contour lines at round values
 * (or the levels the sheet gives) labelled where they run, and a colour bar with the unit at the right.
 * It reads in print as a contour map of a terrain does: what is high, what is low, and how much.
 */

import { niceScale, xPosition, yPosition, type ChartLayout, type ChartSpec } from './chart.js';
import { pngDataUri } from './png.js';

/** A surface of a chart: z on a grid, in the units of the axes and of z. */
export interface ChartSurface {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  /** z[i][j] at xs[i], ys[j]; NaN where there is no value (a hole). */
  readonly z: readonly (readonly number[])[];
  /** Above the colour bar, e.g. "w [mm]". */
  readonly zTitle: string;
  /** The values of the contour lines; else round ones, levelCount of them (about 8). */
  readonly levels?: readonly number[];
  readonly levelCount?: number;
  /** The highest and the lowest point: marked with their value. */
  readonly extremes?: readonly { readonly x: number; readonly y: number; readonly z: number; readonly peak: boolean }[];
}

/** Colours of a map from low to high: sequential (one way), diverging (round zero), grey (for black-and-white print). */
export type Colormap = 'auto' | 'sequential' | 'diverging' | 'gray';

const SEQUENTIAL = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
const DIVERGING = ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'];
const GRAY = ['#f2f2f2', '#262626'];
/** Room at the right of the plot for the colour bar and its ticks. */
export const COLOR_BAR = 74;
const INK = '#0b0b0b';
const INK_2 = '#52514e';
const r = (v: number) => Math.round(v * 100) / 100;

/** The finite values of z: the lowest and the highest. */
export function surfaceRange(surface: ChartSurface): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const column of surface.z) for (const v of column) if (Number.isFinite(v)) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
  return Number.isFinite(lo) ? [lo, hi] : [0, 1];
}

/** The levels of the contour lines: those given, else round values inside the range. */
export function surfaceLevels(surface: ChartSurface): number[] {
  const [lo, hi] = surfaceRange(surface);
  if (surface.levels) return surface.levels.filter((v) => v > lo && v < hi);
  if (!(hi > lo)) return [];
  const ticks = niceScale(lo, hi, (surface.levelCount ?? 8) + 1).ticks;
  return ticks.filter((v) => v > lo + (hi - lo) * 1e-6 && v < hi - (hi - lo) * 1e-6);
}

/** The colour map a surface is drawn in: diverging round zero where z goes well to both sides, else sequential. */
export function colormapOf(surface: ChartSurface, asked: Colormap): Exclude<Colormap, 'auto'> {
  if (asked !== 'auto') return asked;
  const [lo, hi] = surfaceRange(surface);
  return lo < 0 && hi > 0 && Math.min(-lo, hi) >= 0.1 * Math.max(-lo, hi) ? 'diverging' : 'sequential';
}

function hex(c: string): [number, number, number] {
  return [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)) as [number, number, number];
}

/** The colour of t from 0 to 1 along the stops, as red, green, blue. */
function along(stops: readonly string[], t: number): [number, number, number] {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  const [a, b] = [hex(stops[k]!), hex(stops[k + 1]!)];
  const f = u - k;
  return a.map((v, i) => Math.round(v + (b[i]! - v) * f)) as [number, number, number];
}

const css = (c: readonly number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The colour of a value: diverging maps keep zero white, so plus and minus read at a glance. */
function painter(map: Exclude<Colormap, 'auto'>, lo: number, hi: number): (v: number) => [number, number, number] {
  if (map === 'diverging') {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    return (v) => along(DIVERGING, 0.5 + v / (2 * m));
  }
  const stops = map === 'gray' ? GRAY : SEQUENTIAL;
  return (v) => along(stops, hi > lo ? (v - lo) / (hi - lo) : 0.5);
}

/** SVG units a pixel of the colours of a map covers: fine enough for print, small enough for the file. */
const PIXEL = 2;

/**
 * The colours of a map as a picture over the plot area: z between the points of the grid read bilinearly,
 * so the colours run smoothly; where corners have no value, only those that have count, a hole fades out.
 */
function mapPicture(surface: ChartSurface, layout: ChartLayout, paint: (v: number) => [number, number, number]): string {
  const { xs, ys, z } = surface;
  const { plot } = layout;
  const width = Math.max(2, Math.ceil((plot.right - plot.left) / PIXEL));
  const height = Math.max(2, Math.ceil((plot.bottom - plot.top) / PIXEL));
  const rgba = new Uint8Array(width * height * 4);
  const [nx, ny] = [xs.length - 1, ys.length - 1];
  for (let q = 0; q < height; q++) {
    // Row q from the top: y from the high end down.
    const v = (1 - (q + 0.5) / height) * ny;
    const j = Math.min(ny - 1, Math.floor(v));
    const fy = v - j;
    for (let p = 0; p < width; p++) {
      const u = ((p + 0.5) / width) * nx;
      const i = Math.min(nx - 1, Math.floor(u));
      const fx = u - i;
      const corners = [
        [z[i]![j]!, (1 - fx) * (1 - fy)],
        [z[i + 1]![j]!, fx * (1 - fy)],
        [z[i + 1]![j + 1]!, fx * fy],
        [z[i]![j + 1]!, (1 - fx) * fy],
      ] as const;
      let weight = 0;
      let sum = 0;
      for (const [value, w] of corners) {
        if (!Number.isFinite(value)) continue;
        weight += w;
        sum += value * w;
      }
      const at = (q * width + p) * 4;
      if (weight < 0.5) continue;
      const [red, green, blue] = paint(sum / weight);
      rgba[at] = red;
      rgba[at + 1] = green;
      rgba[at + 2] = blue;
      rgba[at + 3] = 255;
    }
  }
  return `<image class="chart-map" x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" preserveAspectRatio="none" href="${pngDataUri(width, height, rgba)}"/>`;
}

/** The pieces of the contour line of a level: segments across the cells of the grid (marching squares). */
export function contourSegments(surface: ChartSurface, level: number): [number, number, number, number][] {
  const { xs, ys, z } = surface;
  const out: [number, number, number, number][] = [];
  const [lo, hi] = surfaceRange(surface);
  const nudge = (hi - lo) * 1e-9;
  const cut = (xa: number, ya: number, va: number, xb: number, yb: number, vb: number): [number, number] => {
    const t = (level + nudge - va) / (vb - va);
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const a = z[i]![j]!;
      const b = z[i + 1]![j]!;
      const c = z[i + 1]![j + 1]!;
      const d = z[i]![j + 1]!;
      if (![a, b, c, d].every(Number.isFinite)) continue;
      const [x0, x1, y0, y1] = [xs[i]!, xs[i + 1]!, ys[j]!, ys[j + 1]!];
      // A corner exactly on the level counts as below it: a level the surface touches along an edge (zero at a support) draws no line there.
      const up = (v: number) => v > level + nudge;
      const points: [number, number][] = [];
      if (up(a) !== up(b)) points.push(cut(x0, y0, a, x1, y0, b));
      if (up(b) !== up(c)) points.push(cut(x1, y0, b, x1, y1, c));
      if (up(d) !== up(c)) points.push(cut(x0, y1, d, x1, y1, c));
      if (up(a) !== up(d)) points.push(cut(x0, y0, a, x0, y1, d));
      if (points.length === 2) out.push([...points[0]!, ...points[1]!]);
      else if (points.length === 4) {
        // A saddle: the middle of the cell decides which sides belong together.
        const [bottom, right, top, left] = points as [[number, number], [number, number], [number, number], [number, number]];
        if (up((a + b + c + d) / 4) === up(a)) out.push([...bottom, ...right], [...top, ...left]);
        else out.push([...bottom, ...left], [...right, ...top]);
      }
    }
  }
  return out;
}

/** The map of a surface: the coloured cells, the contour lines with their values, the extremes, the colour bar. */
export function surfaceSvg(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string, asked: Colormap, font: number): string {
  const surface = spec.surface;
  if (!surface) return '';
  const { xs, ys, z } = surface;
  const [lo, hi] = surfaceRange(surface);
  const map = colormapOf(surface, asked);
  const paint = painter(map, lo, hi);
  const { plot } = layout;
  // The colours: a picture over the plot area.
  const cells = mapPicture(surface, layout, paint);
  // The contour lines, one path a level; its value written on it once, where it runs longest, on a halo of paper.
  const levels = surfaceLevels(surface);
  const lines: string[] = [];
  const labels: string[] = [];
  const taken: [number, number][] = [];
  for (const level of levels) {
    const segments = contourSegments(surface, level).map(([a, b, c, d]) => [xPosition(layout, a), yPosition(layout, b), xPosition(layout, c), yPosition(layout, d)] as const);
    if (segments.length === 0) continue;
    const zero = map === 'diverging' && level === 0;
    lines.push(`<path class="chart-contour" d="${segments.map(([a, b, c, d]) => `M${r(a)} ${r(b)}L${r(c)} ${r(d)}`).join('')}" fill="none" stroke="${INK}" stroke-opacity="${zero ? 0.9 : 0.55}" stroke-width="${zero ? 1.2 : 0.8}" stroke-linecap="round"/>`);
    // Of the pieces, the one nearest the middle of the plot that keeps clear of the labels already written.
    const mid = [(plot.left + plot.right) / 2, (plot.top + plot.bottom) / 2];
    const spots = segments
      .map(([a, b, c, d]) => [(a + c) / 2, (b + d) / 2] as const)
      .filter(([x, y]) => x > plot.left + 18 && x < plot.right - 18 && y > plot.top + 8 && y < plot.bottom - 8)
      .sort((p, q) => Math.hypot(p[0] - mid[0]!, p[1] - mid[1]!) - Math.hypot(q[0] - mid[0]!, q[1] - mid[1]!));
    const spot = spots.find(([x, y]) => taken.every(([u, v]) => Math.abs(u - x) > 46 || Math.abs(v - y) > font + 4));
    if (spot) {
      taken.push([spot[0], spot[1]]);
      labels.push(`<text class="chart-contour-label" x="${r(spot[0])}" y="${r(spot[1] + font * 0.35)}" text-anchor="middle" font-size="${font - 1}" fill="${INK}" stroke="#fff" stroke-width="3" stroke-opacity="0.85" paint-order="stroke">${format(level)}</text>`);
    }
  }
  // The highest and the lowest point: a diamond, its value beside it.
  const marks = (surface.extremes ?? []).map((e, k) => {
    const [px, py] = [xPosition(layout, e.x), yPosition(layout, e.y)];
    const below = py - plot.top < 22;
    const anchor = px > plot.right - 50 ? 'end' : px < plot.left + 50 ? 'start' : 'middle';
    return (
      `<path class="chart-extreme" d="M${r(px)} ${r(py - 6)}L${r(px + 6)} ${r(py)}L${r(px)} ${r(py + 6)}L${r(px - 6)} ${r(py)}Z" fill="${e.peak ? INK : '#fff'}" stroke="${e.peak ? '#fff' : INK}" stroke-width="1.5"/>` +
      `<text data-label="e0.${k}" class="chart-label chart-extreme-label" x="${r(px)}" y="${r(below ? py + 19 : py - 10)}" text-anchor="${anchor}" fill="${INK}" font-weight="600" stroke="#fff" stroke-width="3" paint-order="stroke">${format(e.z)}</text>`
    );
  });
  // The colour bar: the colours from low to high, the levels on it, the title above.
  const barX = plot.right + 14;
  const barW = 12;
  const id = `kalketa-bar-${map}`;
  const stops = Array.from({ length: 11 }, (_, k) => `<stop offset="${k / 10}" stop-color="${css(paint(lo + ((hi - lo) * (10 - k)) / 10))}"/>`).join('');
  const barY = (v: number) => plot.bottom - ((v - lo) / (hi - lo || 1)) * (plot.bottom - plot.top);
  const ticks = [lo, ...levels, hi].filter((v, k, all) => k === 0 || k === all.length - 1 || (Math.abs(barY(v) - barY(lo)) > font && Math.abs(barY(v) - barY(hi)) > font));
  const bar =
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>` +
    `<rect class="chart-colorbar" x="${barX}" y="${plot.top}" width="${barW}" height="${plot.bottom - plot.top}" fill="url(#${id})" stroke="${INK_2}" stroke-width="0.6"/>` +
    ticks.map((v) => `<line x1="${barX + barW}" x2="${barX + barW + 3}" y1="${r(barY(v))}" y2="${r(barY(v))}" stroke="${INK_2}"/><text x="${barX + barW + 5}" y="${r(barY(v) + font * 0.35)}" fill="${INK_2}">${format(v)}</text>`).join('') +
    // The title ends at the right edge of the chart: a long one runs to the left, over the plot, not off the paper.
    `<text x="${layout.width - 2}" y="${plot.top - 10}" text-anchor="end" fill="${INK_2}">${esc(surface.zTitle)}</text>`;
  return (
    cells +
    `<g class="chart-contours">${lines.join('')}</g>` +
    `<rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" fill="none" stroke="${INK_2}" stroke-width="0.8"/>` +
    labels.join('') +
    marks.join('') +
    bar
  );
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** z at a point of the rectangle, read bilinearly between the points of the grid; NaN outside or in a hole. */
export function surfaceAt(surface: ChartSurface, x: number, y: number): number {
  const { xs, ys, z } = surface;
  const [nx, ny] = [xs.length - 1, ys.length - 1];
  const u = ((x - xs[0]!) / (xs[nx]! - xs[0]!)) * nx;
  const v = ((y - ys[0]!) / (ys[ny]! - ys[0]!)) * ny;
  if (!(u >= 0 && u <= nx && v >= 0 && v <= ny)) return NaN;
  const i = Math.min(nx - 1, Math.floor(u));
  const j = Math.min(ny - 1, Math.floor(v));
  const [fx, fy] = [u - i, v - j];
  return z[i]![j]! * (1 - fx) * (1 - fy) + z[i + 1]![j]! * fx * (1 - fy) + z[i + 1]![j + 1]! * fx * fy + z[i]![j + 1]! * (1 - fx) * fy;
}
