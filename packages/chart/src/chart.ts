/**
 * A chart as SVG: axes with round ticks, a recessive grid, curves, points or
 * bars, a legend and labels at the ends of the curves. Plain numbers in, a
 * string out: no DOM, no knowledge of units or of the sheet, so print, PDF
 * and the editor draw the same picture.
 */

export type ChartKind = 'line' | 'points' | 'bar';

export interface ChartSeries {
  /** Name in the legend and at the end of the curve, e.g. "M(x)". */
  readonly label: string;
  readonly xs: readonly number[];
  /** NaN where the curve has no value: a gap. */
  readonly ys: readonly number[];
  /** Drawn otherwise than the chart's kind: measured points among lines, a fitted line among points. */
  readonly mark?: 'line' | 'points';
  /** x where the curve meets the x axis, marked and labelled "x = 1,07". */
  readonly roots?: readonly number[];
  /** Its peaks and dips (the vertex of a parabola): a filled mark with its coordinates [x; y]. */
  readonly extremes?: readonly { readonly x: number; readonly y: number; readonly peak: boolean }[];
  /** Where it turns from bending one way to the other (y″ = 0): a cross with [x; y]. */
  readonly inflections?: readonly { readonly x: number; readonly y: number }[];
  /** x of the vertical lines the curve is symmetric about, drawn dashed with their value. */
  readonly axes?: readonly number[];
  /** The name the roots are labelled with (the variable of the x axis) and its unit. */
  readonly rootName?: string;
  readonly rootUnit?: string;
  /** An implicit curve (x² + y² = 25): pieces between NaN, x not growing along it; no value under the pointer. */
  readonly implicit?: boolean;
}

export interface ChartSpec {
  readonly kind: ChartKind;
  readonly series: readonly ChartSeries[];
  /** Under the x axis, e.g. "x [m]". */
  readonly xTitle: string;
  /** Above the y axis, e.g. "M [kN·m]". */
  readonly yTitle: string;
  /** The y axis from and to as set (ylim); the curves beyond it are cut off. Else it follows the values. */
  readonly yRange?: readonly [number, number];
  /** The x axis from and to (an implicit curve over x: a .. b); else it ends at the data. */
  readonly xRange?: readonly [number, number];
  /** The area between the first curve and the x axis from .. to, hatched, with ∫ y dx in it. */
  readonly area?: { readonly from: number; readonly to: number; readonly value: number; readonly unit: string; readonly name?: string; readonly xs?: readonly number[]; readonly ys?: readonly number[]; readonly above?: number; readonly below?: number };
  /** Points of the sheet (the vertex [x_v; y_v]…): a dark dot with its coordinates. */
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  /** The tangent of the first curve at a point: its slope y′ and its angle from the x axis. */
  readonly tangent?: { readonly x: number; readonly y: number; readonly slope: number };
  /** Labels moved by hand, by their key (r0.1, e0.0, a0.0, i0.0, t, s), in units of the chart. */
  readonly labelOffsets?: Readonly<Record<string, readonly [number, number]>>;
}

export interface ChartOptions {
  /** Size in px of the SVG user space; the SVG scales to its box. */
  readonly width?: number;
  readonly height?: number;
  /** Numbers of the ticks: decimal comma, thousands. */
  readonly format?: (value: number) => string;
  /** Ticks of an x axis of dates (days from 1970-01-01). */
  readonly formatX?: (value: number) => string;
  /** Accessible name of the chart. */
  readonly title?: string;
}

/** Categorical colours, in this order (validated for colour vision deficiencies on white paper). */
export const SERIES_COLORS: readonly string[] = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
/** Dash of each curve, so curves stay apart in black-and-white print too. */
export const SERIES_DASHES: readonly string[] = ['', '7 4', '2 3', '10 3 2 3', '4 4', '12 4', '2 2 6 2', '1 4'];
const INK = '#0b0b0b';
const INK_2 = '#52514e';
const MUTED = '#898781';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export interface Scale {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

export interface ChartLayout {
  readonly width: number;
  readonly height: number;
  /** The plot area inside the axes. */
  readonly plot: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly x: Scale;
  readonly y: Scale;
  /** Bars: the categories (x values) in order. */
  readonly categories?: readonly number[];
}

/** Round ticks covering [min, max]: steps of 1, 2 or 5 times a power of ten. */
export function niceScale(min: number, max: number, count = 6, includeZero = false): Scale {
  let lo = includeZero ? Math.min(0, min) : min;
  let hi = includeZero ? Math.max(0, max) : max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw * 0.999) ?? 10 * power;
  const first = Math.floor(lo / step + 1e-9) * step;
  const last = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return { min: first, max: last, ticks };
}

function finite(values: Iterable<number>): number[] {
  return [...values].filter((v) => Number.isFinite(v));
}

/** Where everything goes; also used by the editor to read the value under the pointer. */
export function chartLayout(spec: ChartSpec, options: ChartOptions = {}): ChartLayout {
  const width = options.width ?? 640;
  const height = options.height ?? 320;
  const format = options.format ?? String;
  const xs = finite(spec.series.flatMap((s) => s.xs));
  const ys = finite(spec.series.flatMap((s) => s.ys));
  const bar = spec.kind === 'bar';
  const categories = bar ? [...new Set(xs)].sort((a, b) => a - b) : undefined;
  // Bars stand on zero; curves get the range of their values.
  const y = spec.yRange ? fixedScale(spec.yRange[0], spec.yRange[1]) : niceScale(Math.min(...ys), Math.max(...ys), 6, bar);
  const x = categories
    ? { min: 0, max: categories.length, ticks: categories }
    : spec.xRange
      ? fixedScale(spec.xRange[0], spec.xRange[1])
      : { ...niceScale(Math.min(...xs), Math.max(...xs), 8), ...tight(xs) };
  // Room for the longest tick label on the left, the labels at the ends of the curves on the right.
  const ticksWidth = Math.max(...y.ticks.map((v) => format(v).length)) * 6.6;
  const ends = !bar && spec.series.length > 1 && spec.series.length <= 4 ? Math.max(...spec.series.map((s) => labelWidth(s.label))) + 12 : 12;
  const legend = spec.series.length > 1 ? 22 : 0;
  const plot = { left: Math.ceil(ticksWidth + 16), top: 26 + legend, right: width - Math.ceil(Math.min(ends, width * 0.25)), bottom: height - 40 };
  return { width, height, plot, x, y, ...(categories ? { categories } : {}) };
}

/** An axis set by hand: exactly from and to, round ticks inside. */
function fixedScale(lo: number, hi: number): Scale {
  const nice = niceScale(lo, hi, 6);
  return { ...nice, min: lo, max: hi, ticks: nice.ticks.filter((t) => t >= lo - (hi - lo) * 1e-9 && t <= hi + (hi - lo) * 1e-9) };
}

/** A curve over its whole x range: the axis ends at the data, ticks stay round inside it. */
function tight(xs: readonly number[]): Partial<Scale> {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  if (!(hi > lo)) return {};
  const nice = niceScale(lo, hi, 8);
  return { min: lo, max: hi, ticks: nice.ticks.filter((t) => t >= lo - (hi - lo) * 1e-9 && t <= hi + (hi - lo) * 1e-9) };
}

export function xPosition(layout: ChartLayout, x: number): number {
  const { plot } = layout;
  if (layout.categories) {
    const i = layout.categories.indexOf(x);
    return plot.left + ((i + 0.5) / layout.categories.length) * (plot.right - plot.left);
  }
  return plot.left + ((x - layout.x.min) / (layout.x.max - layout.x.min)) * (plot.right - plot.left);
}

export function yPosition(layout: ChartLayout, y: number): number {
  const { plot } = layout;
  return plot.bottom - ((y - layout.y.min) / (layout.y.max - layout.y.min)) * (plot.bottom - plot.top);
}

/** The x value at a horizontal position in the plot area (the inverse of xPosition). */
export function xValueAt(layout: ChartLayout, px: number): number {
  const { plot } = layout;
  const share = (px - plot.left) / (plot.right - plot.left);
  if (layout.categories) return layout.categories[Math.min(layout.categories.length - 1, Math.max(0, Math.floor(share * layout.categories.length)))]!;
  return layout.x.min + share * (layout.x.max - layout.x.min);
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Parts of a name with its indices, as the sheet writes them: M_Ed -> M, Ed (an index). */
export function labelParts(text: string): { text: string; sub: boolean }[] {
  return text.split(/_([\p{L}\p{N}]+)/u).flatMap((part, i) => (part ? [{ text: part, sub: i % 2 === 1 }] : []));
}

/** A label for SVG text: indices as subscripts. */
function label(text: string): string {
  // dy moves the rest of the text too: down for an index, back up after it.
  let down = false;
  return labelParts(text)
    .map((p) => {
      const shift = p.sub === down ? '' : p.sub ? ' dy="3" font-size="80%"' : ' dy="-3"';
      down = p.sub;
      return shift ? `<tspan${shift}>${esc(p.text)}</tspan>` : esc(p.text);
    })
    .join('');
}

/** The width of a label in px, at 11 px. */
function labelWidth(text: string): number {
  return labelParts(text).reduce((w, p) => w + p.text.length * (p.sub ? 5.3 : 6.6), 0);
}
const r = (v: number) => Math.round(v * 100) / 100;

/** The chart as an SVG element that scales to the width of its box. */
export function chartSvg(spec: ChartSpec, options: ChartOptions = {}): string {
  const layout = chartLayout(spec, options);
  const { width, height, plot } = layout;
  const format = options.format ?? String;
  const formatX = options.formatX ?? format;
  const parts: string[] = [];
  const text = (x: number, y: number, content: string, attrs: string) => `<text x="${r(x)}" y="${r(y)}" ${attrs}>${label(content)}</text>`;

  // Grid and y ticks: hairlines behind the data.
  for (const t of layout.y.ticks) {
    const y = yPosition(layout, t);
    parts.push(`<line x1="${plot.left}" x2="${plot.right}" y1="${r(y)}" y2="${r(y)}" stroke="${t === 0 ? AXIS : GRID}" stroke-width="1"/>`);
    parts.push(text(plot.left - 6, y + 4, format(t), `text-anchor="end" fill="${MUTED}"`));
  }
  // x ticks.
  const xTicks = thinned(layout.x.ticks, (t) => formatX(t).length * 6.6 + 10, plot.right - plot.left);
  for (const t of xTicks) {
    const x = xPosition(layout, t);
    if (!layout.categories) parts.push(`<line x1="${r(x)}" x2="${r(x)}" y1="${plot.top}" y2="${plot.bottom}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(text(x, plot.bottom + 16, formatX(t), `text-anchor="middle" fill="${MUTED}"`));
  }
  // The axes: x at the bottom (or at zero), y on the left.
  const zero = layout.y.min < 0 && layout.y.max > 0 ? yPosition(layout, 0) : plot.bottom;
  parts.push(`<line x1="${plot.left}" x2="${plot.right}" y1="${r(zero)}" y2="${r(zero)}" stroke="${AXIS}" stroke-width="1"/>`);
  parts.push(`<line x1="${plot.left}" x2="${plot.left}" y1="${plot.top}" y2="${plot.bottom}" stroke="${AXIS}" stroke-width="1"/>`);
  if (spec.xTitle) parts.push(text((plot.left + plot.right) / 2, height - 8, spec.xTitle, `text-anchor="middle" fill="${INK_2}"`));
  if (spec.yTitle) parts.push(text(plot.left - 6, plot.top - 10, spec.yTitle, `text-anchor="start" fill="${INK_2}"`));

  const data = `<g class="chart-data">${spec.kind === 'bar' ? bars(spec, layout) : curves(spec, layout)}</g>`;
  // A y axis set by hand cuts off what lies beyond it: the data in a window of the plot area.
  parts.push(
    spec.yRange
      ? `<svg x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" viewBox="${plot.left} ${plot.top} ${plot.right - plot.left} ${plot.bottom - plot.top}" overflow="hidden">${data}</svg>`
      : data,
  );
  // The marks of points first, their labels over all of them: a label is never hidden under a mark, and can be taken.
  const marks = [areaMarks(spec, layout, format), symmetryLines(spec, layout, formatX), rootMarks(spec, layout, formatX), extremeMarks(spec, layout, formatX, format), inflectionMarks(spec, layout, formatX, format), pointMarks(spec, layout, formatX, format), tangentMarks(spec, layout, format)].join('');
  const LABEL = /(?:<line class="chart-label-lead"[^>]*\/>)?<text data-label="[^"]*"[^>]*>.*?<\/text>/g;
  parts.push(marks.replace(LABEL, ''), ...(marks.match(LABEL) ?? []));
  if (spec.series.length > 1) parts.push(legend(spec, layout));
  if (spec.kind !== 'bar' && spec.series.length > 1 && spec.series.length <= 4) parts.push(endLabels(spec, layout));

  const title = options.title ? `<title>${esc(options.title)}</title>` : '';
  return `<svg class="chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" font-family='${FONT}' font-size="11" style="width:100%;height:auto;display:block">${title}${parts.join('')}</svg>`;
}

/** Every n-th tick, so labels do not run into each other. */
function thinned(ticks: readonly number[], size: (t: number) => number, room: number): number[] {
  const widest = Math.max(...ticks.map(size));
  const every = Math.max(1, Math.ceil((widest * ticks.length) / room));
  return ticks.filter((_, i) => i % every === 0);
}

function curves(spec: ChartSpec, layout: ChartLayout): string {
  const out: string[] = [];
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    const points = s.xs.map((x, j) => [x, s.ys[j]!] as const);
    if ((s.mark ?? spec.kind) === 'line') {
      // A gap (NaN) ends a piece of the curve.
      let d = '';
      let pen = false;
      for (const [x, y] of points) {
        if (!Number.isFinite(y)) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${r(xPosition(layout, x))} ${r(yPosition(layout, y))}`;
        pen = true;
      }
      const dash = SERIES_DASHES[i] ? ` stroke-dasharray="${SERIES_DASHES[i]}"` : '';
      out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${dash}/>`);
      // A curve of a few points shows them.
      if (points.length <= 30) out.push(markers(points, layout, color, i, 3));
    } else {
      out.push(markers(points, layout, color, i, 4));
    }
  });
  return out.join('');
}

/** Marker shapes by series: circle, square, triangle, diamond… (a second channel next to colour). */
function markers(points: readonly (readonly [number, number])[], layout: ChartLayout, color: string, series: number, size: number): string {
  return points
    .filter(([, y]) => Number.isFinite(y))
    .map(([x, y]) => marker(xPosition(layout, x), yPosition(layout, y), series % 4, size, color))
    .join('');
}

function marker(x: number, y: number, shape: number, s: number, color: string): string {
  // A ring of paper around every mark keeps overlapping marks apart.
  const style = `fill="${color}" stroke="#ffffff" stroke-width="1.5"`;
  switch (shape) {
    case 1:
      return `<rect x="${r(x - s)}" y="${r(y - s)}" width="${2 * s}" height="${2 * s}" ${style}/>`;
    case 2:
      return `<path d="M${r(x)} ${r(y - s * 1.2)}L${r(x + s * 1.15)} ${r(y + s * 0.9)}L${r(x - s * 1.15)} ${r(y + s * 0.9)}Z" ${style}/>`;
    case 3:
      return `<path d="M${r(x)} ${r(y - s * 1.3)}L${r(x + s * 1.3)} ${r(y)}L${r(x)} ${r(y + s * 1.3)}L${r(x - s * 1.3)} ${r(y)}Z" ${style}/>`;
    default:
      return `<circle cx="${r(x)}" cy="${r(y)}" r="${s}" ${style}/>`;
  }
}

function bars(spec: ChartSpec, layout: ChartLayout): string {
  const categories = layout.categories ?? [];
  const band = (layout.plot.right - layout.plot.left) / Math.max(1, categories.length);
  const n = spec.series.length;
  // Bars of one category side by side, 2 px of paper between them.
  const group = Math.min(band * 0.75, 48 * n);
  const width = Math.max(1, (group - 2 * (n - 1)) / n);
  const zero = yPosition(layout, Math.max(layout.y.min, Math.min(0, layout.y.max)));
  const out: string[] = [];
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    s.xs.forEach((x, j) => {
      const y = s.ys[j]!;
      if (!Number.isFinite(y)) return;
      const left = xPosition(layout, x) - group / 2 + i * (width + 2);
      const top = yPosition(layout, y);
      out.push(barPath(left, width, zero, top, color));
    });
  });
  return out.join('');
}

/** A bar from the baseline with rounded corners at its data end only. */
function barPath(left: number, width: number, base: number, end: number, color: string): string {
  const up = end < base;
  const height = Math.abs(base - end);
  const radius = Math.min(4, width / 2, height);
  const right = left + width;
  const d = up
    ? `M${r(left)} ${r(base)}V${r(end + radius)}Q${r(left)} ${r(end)} ${r(left + radius)} ${r(end)}H${r(right - radius)}Q${r(right)} ${r(end)} ${r(right)} ${r(end + radius)}V${r(base)}Z`
    : `M${r(left)} ${r(base)}V${r(end - radius)}Q${r(left)} ${r(end)} ${r(left + radius)} ${r(end)}H${r(right - radius)}Q${r(right)} ${r(end)} ${r(right)} ${r(end - radius)}V${r(base)}Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

function legend(spec: ChartSpec, layout: ChartLayout): string {
  let x = layout.plot.left;
  const y = 12;
  return spec.series
    .map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
      const kind = spec.kind === 'bar' ? 'bar' : (s.mark ?? spec.kind);
      const dash = kind === 'line' && SERIES_DASHES[i] ? ` stroke-dasharray="${SERIES_DASHES[i]}"` : '';
      const key =
        kind === 'line'
          ? `<line x1="${r(x)}" x2="${r(x + 22)}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="2"${dash}/>`
          : kind === 'points'
            ? marker(x + 11, y, i % 4, 4, color)
            : `<rect x="${r(x + 5)}" y="${y - 6}" width="12" height="12" rx="2" fill="${color}"/>`;
      const item = `${key}<text x="${r(x + 28)}" y="${y + 4}" fill="${INK}">${label(s.label)}</text>`;
      x += 28 + labelWidth(s.label) + 18;
      return item;
    })
    .join('');
}

/** A point inside the plot area, give or take a hair (a vertex exactly on the edge of the axis is inside). */
function inPlot(layout: ChartLayout, x: number, y: number): boolean {
  const ex = (layout.x.max - layout.x.min) * 1e-9;
  const ey = (layout.y.max - layout.y.min) * 1e-9;
  return x >= layout.x.min - ex && x <= layout.x.max + ex && y >= layout.y.min - ey && y <= layout.y.max + ey;
}

/**
 * A label of a point of the chart: by its key (r0.1 the second root of the first curve…)
 * a person may move it off the curve; moved, a thin line leads back to its point.
 */
function placed(spec: ChartSpec, key: string, point: readonly [number, number], at: readonly [number, number], content: string, attrs: string): string {
  const [dx, dy] = spec.labelOffsets?.[key] ?? [0, 0];
  const [x, y] = [at[0] + dx, at[1] + dy];
  const lead = dx || dy ? `<line class="chart-label-lead" x1="${r(point[0])}" y1="${r(point[1])}" x2="${r(x)}" y2="${r(y - 4)}" stroke="${MUTED}" stroke-width="0.8"/>` : '';
  return `${lead}<text data-label="${key}" x="${r(x)}" y="${r(y)}" ${attrs} stroke="#fff" stroke-width="3" paint-order="stroke">${content}</text>`;
}

/** The peaks and dips of the curves: a filled diamond, its coordinates [x; y] above a peak or below a dip. */
function extremeMarks(spec: ChartSpec, layout: ChartLayout, formatX: (value: number) => string, format: (value: number) => string): string {
  const out: string[] = [];
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    (s.extremes ?? []).forEach((e, k) => {
      if (!inPlot(layout, e.x, e.y)) return;
      const [px, py] = [xPosition(layout, e.x), yPosition(layout, e.y)];
      out.push(`<path class="chart-extreme" d="M${r(px)} ${r(py - 6)}L${r(px + 6)} ${r(py)}L${r(px)} ${r(py + 6)}L${r(px - 6)} ${r(py)}Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>`);
      const text = `[${formatX(e.x)}; ${format(e.y)}]`;
      // Inside the plot: below a dip near the top, above a peak near the bottom.
      const below = e.peak ? py - layout.plot.top < 20 : layout.plot.bottom - py > 20;
      out.push(placed(spec, `e${i}.${k}`, [px, py], [px, below ? py + 19 : py - 11], esc(text), `class="chart-label chart-extreme-label" text-anchor="middle" fill="${INK}"`));
    });
  });
  return out.join('');
}

/** Points of the sheet: a dark dot, its coordinates [x; y] above it. */
function pointMarks(spec: ChartSpec, layout: ChartLayout, formatX: (value: number) => string, format: (value: number) => string): string {
  return (spec.points ?? [])
    .map((p, k) => {
      if (!inPlot(layout, p.x, p.y)) return '';
      const [px, py] = [xPosition(layout, p.x), yPosition(layout, p.y)];
      return `<circle class="chart-point" cx="${r(px)}" cy="${r(py)}" r="4.5" fill="${INK}" stroke="#fff" stroke-width="1.5"/>` + placed(spec, `p0.${k}`, [px, py], [px + 8, py - 9], esc(`[${formatX(p.x)}; ${format(p.y)}]`), `class="chart-label chart-point-label" fill="${INK}"`);
    })
    .join('');
}

/** Where the curves turn from bending one way to the other: a cross in the colour of the curve, [x; y] beside it. */
function inflectionMarks(spec: ChartSpec, layout: ChartLayout, formatX: (value: number) => string, format: (value: number) => string): string {
  const out: string[] = [];
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    (s.inflections ?? []).forEach((e, k) => {
      if (!inPlot(layout, e.x, e.y)) return;
      const [px, py] = [xPosition(layout, e.x), yPosition(layout, e.y)];
      out.push(`<circle class="chart-inflection" cx="${r(px)}" cy="${r(py)}" r="5" fill="#fff" stroke="${color}" stroke-width="2"/><path d="M${r(px - 3)} ${r(py - 3)}L${r(px + 3)} ${r(py + 3)}M${r(px + 3)} ${r(py - 3)}L${r(px - 3)} ${r(py + 3)}" stroke="${color}" stroke-width="1.6"/>`);
      out.push(placed(spec, `i${i}.${k}`, [px, py], [px + 8, py - 8], esc(`[${formatX(e.x)}; ${format(e.y)}]`), `class="chart-label chart-inflection-label" fill="${INK}"`));
    });
  });
  return out.join('');
}

/** The area between the first curve and the x axis from .. to: hatched in its colour, the value of the integral in it. */
function areaMarks(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string): string {
  const a = spec.area;
  const s = spec.series[0];
  if (!a || !s) return '';
  const color = SERIES_COLORS[0]!;
  const zero = yPosition(layout, Math.min(Math.max(0, layout.y.min), layout.y.max));
  // Of an integral of the sheet its own integrand at its own points; else the first curve between the bounds.
  const own = a.xs && a.ys ? a.xs.map((x, j) => [x, a.ys![j]!] as const) : undefined;
  const inside = (own ?? s.xs.map((x, j) => [x, s.ys[j]!] as const)).filter(([x, y]) => x > a.from && x < a.to && Number.isFinite(y));
  const ends = own ? [own[0]!, own[own.length - 1]!] : [a.from, a.to].map((x) => {
    // The curve at the bounds, between the samples around them.
    const j = s.xs.findIndex((v) => v >= x);
    if (j <= 0) return [x, s.ys[Math.max(j, 0)]!] as const;
    const t = (x - s.xs[j - 1]!) / (s.xs[j]! - s.xs[j - 1]!);
    return [x, s.ys[j - 1]! + t * (s.ys[j]! - s.ys[j - 1]!)] as const;
  });
  const points = [ends[0]!, ...inside, ends[1]!].filter(([, y]) => Number.isFinite(y));
  if (points.length < 2) return '';
  // Where the curve crosses the axis between two points, a point on the axis: the parts above and below meet there.
  const crossed: (readonly [number, number])[] = [];
  points.forEach((p, k) => {
    const q = points[k - 1];
    if (q && Math.sign(q[1]) * Math.sign(p[1]) < 0) crossed.push([q[0] + ((p[0] - q[0]) * q[1]) / (q[1] - p[1]), 0]);
    crossed.push(p);
  });
  const outline = (clamp: (y: number) => number) =>
    crossed.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${r(xPosition(layout, x))} ${r(yPosition(layout, clamp(y)))}`).join('') + `L${r(xPosition(layout, a.to))} ${r(zero)}L${r(xPosition(layout, a.from))} ${r(zero)}Z`;
  // The hatch: lines at 45° in the colour of the curve over a light wash; below the axis the other way, in red
  // (the same patterns in every chart, so one id each serves).
  const below = '#e34948';
  const pattern = `<defs><pattern id="kalketa-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${color}" stroke-width="1.3" stroke-opacity="0.75"/></pattern><pattern id="kalketa-hatch-below" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${below}" stroke-width="1.3" stroke-opacity="0.75"/></pattern></defs>`;
  const split = a.above !== undefined && a.below !== undefined;
  const one = (d: string, tint: string, hatch: string, cls: string) => `<path class="${cls}" d="${d}" fill="${tint}" fill-opacity="0.08"/><path d="${d}" fill="url(#${hatch})" stroke="${tint}" stroke-width="0.8" stroke-opacity="0.6"/>`;
  const fill = split
    ? one(outline((y) => Math.max(y, 0)), color, 'kalketa-hatch', 'chart-area chart-area-above') + one(outline((y) => Math.min(y, 0)), below, 'kalketa-hatch-below', 'chart-area chart-area-below')
    : one(outline((y) => y), color, 'kalketa-hatch', 'chart-area');
  // Its value in the middle of the area, half way between the axis and the curve.
  const mid = (a.from + a.to) / 2;
  const near = points.reduce((best, p) => (Math.abs(p[0] - mid) < Math.abs(best[0] - mid) ? p : best), points[0]!);
  const [px, py] = [xPosition(layout, mid), (zero + yPosition(layout, near[1])) / 2];
  // Linked to an integral of the sheet: its name and its value as the sheet has it; else S = |∫ y dx|.
  // Over both sides of the axis the integral counts one part against the other: both parts are said too.
  const unit = a.unit ? ` ${a.unit}` : '';
  const text = `${a.name ?? 'S'} = ${format(a.name || split ? a.value : Math.abs(a.value))}${unit}${split ? ` (+${format(a.above!)} / −${format(a.below!)})` : ''}`;
  return pattern + fill + placed(spec, 's', [px, py], [px, py + 4], label(text), `class="chart-label chart-area-label" text-anchor="middle" fill="${INK}" font-weight="600"`);
}

/** The tangent of the first curve at its point: a line across the plot, the point to drag, k = y′ and α from the x axis. */
function tangentMarks(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string): string {
  const t = spec.tangent;
  if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y) || t.x < layout.x.min || t.x > layout.x.max) return '';
  // Its point beyond the y axis set by hand: the line only, cut off at the plot (no point to drag outside the chart).
  const shown = t.y >= layout.y.min && t.y <= layout.y.max;
  const { plot } = layout;
  const ends = [layout.x.min, layout.x.max].map((x) => [xPosition(layout, x), yPosition(layout, t.y + t.slope * (x - t.x))] as const);
  const [px, py] = [xPosition(layout, t.x), yPosition(layout, t.y)];
  const line = `<line class="chart-tangent" x1="${r(ends[0]![0])}" y1="${r(ends[0]![1])}" x2="${r(ends[1]![0])}" y2="${r(ends[1]![1])}" stroke="${INK_2}" stroke-width="1.4" stroke-dasharray="6 3"/>`;
  // Cut off at the plot area: the line is long, the chart is not.
  const clipped = `<svg x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" viewBox="${plot.left} ${plot.top} ${plot.right - plot.left} ${plot.bottom - plot.top}" overflow="hidden">${line}</svg>`;
  const handle = `<circle class="chart-tangent-handle" data-chart-drag="tangent" cx="${r(px)}" cy="${r(py)}" r="6" fill="${SERIES_COLORS[0]}" stroke="#fff" stroke-width="2" style="cursor:ew-resize"/>`;
  const angle = (Math.atan(t.slope) * 180) / Math.PI;
  const text = `k = ${format(t.slope)}; α = ${format(Math.round(angle * 10) / 10)}°`;
  if (!shown) return clipped;
  return clipped + handle + placed(spec, 't', [px, py], [px + 10, py + (t.slope > 0 ? 18 : -12)], esc(text), `class="chart-label chart-tangent-label" fill="${INK}"`);
}

/** The axes of symmetry of the curves: a dashed vertical line in the colour of the curve, its value at the top. */
function symmetryLines(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string): string {
  const { plot } = layout;
  const out: string[] = [];
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    (s.axes ?? []).forEach((x, k) => {
      if (x < layout.x.min || x > layout.x.max) return;
      const px = r(xPosition(layout, x));
      out.push(`<line class="chart-axis-of-symmetry" x1="${px}" x2="${px}" y1="${plot.top}" y2="${plot.bottom}" stroke="${color}" stroke-width="1.2" stroke-dasharray="8 3 2 3" opacity="0.8"/>`);
      const text = `${s.rootName ?? 'x'} = ${format(x)}${s.rootUnit ? ` ${s.rootUnit}` : ''}`;
      out.push(placed(spec, `a${i}.${k}`, [px, plot.top + 8], [px + 4, plot.top + 11], label(text), `class="chart-label chart-axis-label" fill="${INK_2}"`));
    });
  });
  return out.join('');
}

/**
 * The roots of the curves on the x axis: a ring in the colour of the curve, its
 * value above it, "x = 1,07" (the label alternates above and below when close).
 */
function rootMarks(spec: ChartSpec, layout: ChartLayout, format: (value: number) => string): string {
  const out: string[] = [];
  if (!(layout.y.min <= 0 && layout.y.max >= 0)) return '';
  const y0 = yPosition(layout, 0);
  let lastX = -Infinity;
  let up = true;
  spec.series.forEach((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
    (s.roots ?? []).forEach((x, k) => {
      if (x < layout.x.min || x > layout.x.max) return;
      const px = xPosition(layout, x);
      out.push(`<circle cx="${r(px)}" cy="${r(y0)}" r="4.5" fill="#fff" stroke="${color}" stroke-width="2"/>`);
      // No index: the order of the solution (x₁ from +√D) need not be the order on the axis.
      const text = `${s.rootName ?? 'x'} = ${format(x)}${s.rootUnit ? ` ${s.rootUnit}` : ''}`;
      up = px - lastX < labelWidth(text) + 8 ? !up : true;
      lastX = px;
      const ty = up ? y0 - 9 : y0 + 17;
      out.push(placed(spec, `r${i}.${k}`, [px, y0], [px, ty], label(text), `class="chart-label chart-root" text-anchor="middle" fill="${INK}"`));
    });
  });
  return out.join('');
}

/** The name of each curve at its last point, moved apart so names do not overlap. */
function endLabels(spec: ChartSpec, layout: ChartLayout): string {
  const ends = spec.series
    .map((s, i) => {
      let j = s.ys.length - 1;
      while (j >= 0 && !Number.isFinite(s.ys[j]!)) j--;
      return j < 0 ? undefined : { i, label: s.label, x: xPosition(layout, s.xs[j]!), y: yPosition(layout, s.ys[j]!) };
    })
    .filter((e) => e !== undefined)
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k]!.y - ends[k - 1]!.y < 13) ends[k]!.y = ends[k - 1]!.y + 13;
  return ends.map((e) => `<text x="${r(e.x + 6)}" y="${r(e.y + 4)}" fill="${INK}">${label(e.label)}</text>`).join('');
}
