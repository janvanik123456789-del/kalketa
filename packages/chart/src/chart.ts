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
}

export interface ChartSpec {
  readonly kind: ChartKind;
  readonly series: readonly ChartSeries[];
  /** Under the x axis, e.g. "x [m]". */
  readonly xTitle: string;
  /** Above the y axis, e.g. "M [kN·m]". */
  readonly yTitle: string;
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
  const y = niceScale(Math.min(...ys), Math.max(...ys), 6, bar);
  const x = categories
    ? { min: 0, max: categories.length, ticks: categories }
    : { ...niceScale(Math.min(...xs), Math.max(...xs), 8), ...tight(xs) };
  // Room for the longest tick label on the left, the labels at the ends of the curves on the right.
  const ticksWidth = Math.max(...y.ticks.map((v) => format(v).length)) * 6.6;
  const ends = !bar && spec.series.length > 1 && spec.series.length <= 4 ? Math.max(...spec.series.map((s) => labelWidth(s.label))) + 12 : 12;
  const legend = spec.series.length > 1 ? 22 : 0;
  const plot = { left: Math.ceil(ticksWidth + 16), top: 26 + legend, right: width - Math.ceil(Math.min(ends, width * 0.25)), bottom: height - 40 };
  return { width, height, plot, x, y, ...(categories ? { categories } : {}) };
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

  parts.push(`<g class="chart-data">${spec.kind === 'bar' ? bars(spec, layout) : curves(spec, layout)}</g>`);
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
    if (spec.kind === 'line') {
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
      const dash = spec.kind === 'line' && SERIES_DASHES[i] ? ` stroke-dasharray="${SERIES_DASHES[i]}"` : '';
      const key =
        spec.kind === 'line'
          ? `<line x1="${r(x)}" x2="${r(x + 22)}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="2"${dash}/>`
          : spec.kind === 'points'
            ? marker(x + 11, y, i % 4, 4, color)
            : `<rect x="${r(x + 5)}" y="${y - 6}" width="12" height="12" rx="2" fill="${color}"/>`;
      const item = `${key}<text x="${r(x + 28)}" y="${y + 4}" fill="${INK}">${label(s.label)}</text>`;
      x += 28 + labelWidth(s.label) + 18;
      return item;
    })
    .join('');
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
