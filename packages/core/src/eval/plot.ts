/**
 * Charts of a sheet (docs/03-jazyk.md, ch. 7.1e): a line of its own that
 * samples expressions, the way an integral does, and hands the print layer
 * plain numbers in display units.
 *
 *   plot(M(x), x: 0 m .. L) | kN·m          a function over an interval
 *   plot(M(x), V(x)·1 m, x: 0 m .. L)       more curves, one y axis
 *   plot(Vyroba.E, x: Vyroba.mesic)         data: y for every x of a series
 *   plot(CF, kind: "bar")                   a series against its order
 *
 * One chart has one y axis: curves of different dimensions are an error
 * (two charts, never a second axis).
 */

import { CalcError, diagnostic, fail, type Span } from '../diagnostics.js';
import type { Expr, NamedArg } from '../lang/ast.js';
import { parsePlacement, type Placement } from '../lang/parser.js';
import { multiplyDims, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol, toDisplay } from '../units/display.js';
import type { UnitRegistry } from '../units/registry.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { daysOf, isDate } from '../values/date.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import { freeNames } from './userFunctions.js';
import type { EvalContext } from './evaluator.js';

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

export const PLOT_FUNCTION = 'plot';
export type PlotKind = 'line' | 'points' | 'bar';
const KINDS: readonly PlotKind[] = ['line', 'points', 'bar'];
/** Options of plot(...); every other named argument is the variable. */
export const PLOT_OPTIONS: readonly string[] = ['kind', 'title', 'samples', 'place', 'ylim', 'roots', 'symmetry', 'extremes', 'inflections', 'area', 'tangent', 'labels'];
/** Curves in one chart: the categorical colours a reader still tells apart. */
export const MAX_PLOT_SERIES = 8;
const LINE_SAMPLES = 201;
const MARK_SAMPLES = 11;
const MAX_SAMPLES = 2001;

export interface PlotSeries {
  /**
   * Over measured x (x: Mereni.t): the data as points, a function of x as a
   * line over their whole range (a fitted curve through its points).
   */
  readonly mark?: 'line' | 'points';
  /** x of every point, in the unit of the x axis (days for dates). */
  readonly xs: readonly number[];
  /** y of every point in the unit of the y axis; NaN where the expression has no value (a gap). */
  readonly ys: readonly number[];
  /** roots: true — where the curve meets the x axis (y = 0), in the unit of the x axis. */
  readonly roots?: readonly number[];
  /** symmetry: true — the vertical lines the curve is symmetric about (x = −b/(2·a) of a parabola). */
  readonly axes?: readonly number[];
  /** extremes: true — its peaks and dips (the vertex of a parabola), in the units of the axes. */
  readonly extremes?: readonly { readonly x: number; readonly y: number; readonly peak: boolean }[];
  /** inflections: true — where it turns from bending one way to the other (y″ changes its sign). */
  readonly inflections?: readonly { readonly x: number; readonly y: number }[];
}

/** area: a .. b — the area between the first curve and the x axis, hatched, with the value of its integral. */
export interface PlotArea {
  readonly from: number;
  readonly to: number;
  /** ∫ y dx from a to b (negative where the curve is below the axis) and its unit. */
  readonly value: number;
  readonly unit: string;
  /** area: S with S := integral(…) in the sheet: its name and value, its integrand drawn at these points. */
  readonly name?: string;
  readonly xs?: readonly number[];
  readonly ys?: readonly number[];
}

/** tangent: x₀ — the tangent of the first curve at x₀: its point and slope y′(x₀) in the units of the axes. */
export interface PlotTangent {
  readonly x: number;
  readonly y: number;
  readonly slope: number;
}

export interface PlotResult {
  readonly kind: PlotKind;
  readonly title?: string;
  /** Name of the variable on the x axis; empty when the x axis is the order of the items. */
  readonly variable: string;
  readonly xUnit: string;
  readonly yUnit: string;
  /** The x axis holds dates (xs are days from 1970-01-01). */
  readonly xDates?: boolean;
  /** One per curve, in the order of the expressions. */
  readonly series: readonly PlotSeries[];
  /** Where the chart stands among the lines (place: "width=40% wrap=right"), as a picture. */
  readonly place?: Placement;
  /** ylim: -20 .. 20: the y axis from and to, in the unit of the y axis; what lies beyond is cut off. */
  readonly yRange?: readonly [number, number];
  readonly area?: PlotArea;
  readonly tangent?: PlotTangent;
  /** labels: "e0.0=0,18 r0.1=-20,-5" — the labels moved by hand, by their key, in units of the chart. */
  readonly labelOffsets?: Readonly<Record<string, readonly [number, number]>>;
}

export function isPlotCall(expr: Expr): expr is CallExpr {
  return expr.kind === 'call' && expr.name === PLOT_FUNCTION;
}

/** A display line plot(...) | unit: samples every curve. */
export function plotStatement(call: CallExpr, ctx: EvalContext, evaluate: Evaluate, target: ResolvedUnit | undefined, formulaOf?: (name: string) => Expr | undefined): PlotResult {
  const binders = call.named.filter((n) => !PLOT_OPTIONS.includes(n.name));
  if (binders.length > 1) fail('E-NAMED-ARG', binders[1]!.nameSpan, { function: call.name, argument: binders[1]!.name, problem: 'unknown' });
  if (call.args.length === 0) fail('E-PLOT-FORM', call.span, {});
  if (call.args.length > MAX_PLOT_SERIES) fail('E-PLOT-SERIES', call.args[MAX_PLOT_SERIES]!.span, { max: MAX_PLOT_SERIES });
  const kind = option(call, 'kind', ctx, evaluate);
  const plotKind = (kind ?? 'line') as PlotKind;
  if (!KINDS.includes(plotKind)) fail('E-PLOT-KIND', call.named.find((n) => n.name === 'kind')!.value.span, { kind: kind ?? '' });
  const title = option(call, 'title', ctx, evaluate);
  const placeText = option(call, 'place', ctx, evaluate);
  const place = placeText === undefined ? undefined : parsePlacement(placeText);
  // A chart has no lines of its own to stand beside: side= is for pictures.
  if (placeText !== undefined && (!place || place.side)) fail('E-PLOT-POSITION', call.named.find((n) => n.name === 'place')!.value.span, { place: placeText });
  const binder = binders[0];
  const xs = binder ? samplePoints(binder, call, plotKind, ctx, evaluate) : undefined;

  // Over measured x (a series, not a range) a line chart shows the data as points and a
  // function of x (a fitted curve) as a line through their whole range.
  const dense = xs && binder && binder.value.kind !== 'range' && plotKind === 'line' && xs.length > 1 && !isDate(xs[0]!) ? across(xs) : undefined;
  // y of every curve at every point; a point without a value is a gap, not a failed chart.
  const drawn = call.args.map((arg) => {
    if (!xs) return { at: undefined, values: series(arg, ctx, evaluate), mark: undefined };
    if (dense && freeNames(arg, new Set()).has(binder!.name)) return { at: dense, values: curve(arg, binder!.name, dense, ctx, evaluate), mark: 'line' as const };
    return { at: xs, values: curve(arg, binder!.name, xs, ctx, evaluate), mark: dense ? ('points' as const) : undefined };
  });
  const columns = drawn.map((d) => d.values);
  const ys = columns.flat().find((q): q is Quantity => q !== undefined);
  if (!ys) {
    // Not one value: report why, from the first point.
    const firstArg = call.args[0]!;
    if (xs) evaluateAt(firstArg, binder!.name, xs[0]!, ctx, evaluate);
    return fail('E-PLOT-FORM', firstArg.span, {});
  }
  const yDim: Dimension = ys.dim;
  call.args.forEach((arg, i) => {
    const other = columns[i]!.find((q) => q && !sameDim(q.dim, yDim));
    if (other) fail('E-PLOT-UNITS', arg.span, { left: baseUnitSymbol(yDim, ctx.registry.baseSymbols()), right: baseUnitSymbol(other.dim, ctx.registry.baseSymbols()) });
  });
  if (target && !sameDim(target.dim, yDim)) throw new CalcError(diagnostic('E-TARGET-UNIT', call.span, { unit: target.symbol, found: baseUnitSymbol(yDim) }));

  const yUnit = target ?? ys.hint;
  const y = (q: Quantity | undefined) => (q ? toDisplay(q, ctx.registry, yUnit).value : NaN);
  const yUnitSymbol = toDisplay(ys, ctx.registry, yUnit).unit;
  const n = columns[0]!.length;
  const yRange = yLimits(call, yDim, y, ctx, evaluate);
  const showRoots = flag(call, 'roots', ctx, evaluate);
  const showAxes = flag(call, 'symmetry', ctx, evaluate);
  const showExtremes = flag(call, 'extremes', ctx, evaluate);
  const showInflections = flag(call, 'inflections', ctx, evaluate);
  let x: { values: number[]; unit: string; dates: boolean };
  if (xs) {
    const first = xs[0]!;
    const dates = isDate(first);
    x = { values: xs.map((q) => (dates ? daysOf(q) : toDisplay(q, ctx.registry, first.hint).value)), unit: dates ? '' : toDisplay(first, ctx.registry, first.hint).unit, dates };
  } else {
    if (columns.some((c) => c.length !== n)) fail('E-PLOT-LENGTH', call.span, {});
    x = { values: Array.from({ length: n }, (_, i) => i + 1), unit: '', dates: false };
  }
  // Of the first curve over an interval: the area under it, its tangent at a point.
  const first = binder?.value.kind === 'range' && xs ? { body: call.args[0]!, name: binder.name, like: xs[0]! } : undefined;
  const xIn = (q: Quantity) => toDisplay(q, ctx.registry, xs?.[0]?.hint).value;
  const area = first ? areaOf(call, first, yDim, ctx, evaluate, xIn, y, formulaOf) : undefined;
  const tangent = first ? tangentOf(call, first, ctx, evaluate, xIn, y) : undefined;
  const labelText = option(call, 'labels', ctx, evaluate);
  const labelOffsets = labelText ? parseLabelOffsets(labelText) : undefined;
  // A point found by searching is exact to some 8 digits: shown at the precision the chart has (2,1·10⁻⁸ is 0).
  const xSpan = x.values.length > 1 ? Math.abs(x.values[x.values.length - 1]! - x.values[0]!) : 1;
  const ySpan = Math.max(...columns.flat().map((q) => (q ? Math.abs(y(q)) : 0))) || 1;
  return {
    kind: plotKind,
    ...(title !== undefined ? { title } : {}),
    variable: binder?.name ?? '',
    xUnit: x.unit,
    yUnit: yUnitSymbol,
    ...(x.dates ? { xDates: true } : {}),
    series: drawn.map((d, i) => {
      // The roots of a curve over an interval: found between the points where it changes sign, then refined.
      const continuous = binder?.value.kind === 'range' && d.at && d.mark !== 'points';
      const roots = showRoots && continuous ? zeros(call.args[i]!, binder!.name, d.at!, d.values, ctx, evaluate) : undefined;
      const axes = showAxes && continuous ? symmetryAxes(call.args[i]!, binder!.name, d.at!, d.values, ctx, evaluate) : undefined;
      const extremes = showExtremes && continuous ? extremesOf(call.args[i]!, binder!.name, d.at!, d.values, ctx, evaluate) : undefined;
      const bends = showInflections && continuous ? inflectionsOf(call.args[i]!, binder!.name, d.at!, ctx, evaluate) : undefined;
      return {
        xs: d.at && d.at !== xs ? d.at.map((q) => toDisplay(q, ctx.registry, xs![0]!.hint).value) : x.values,
        ys: d.values.map(y),
        ...(d.mark ? { mark: d.mark } : {}),
        ...(roots && roots.length > 0 ? { roots: roots.map((q) => tidy(toDisplay(q, ctx.registry, xs![0]!.hint).value, xSpan)) } : {}),
        ...(axes && axes.length > 0 ? { axes: axes.map((q) => tidy(toDisplay(q, ctx.registry, xs![0]!.hint).value, xSpan)) } : {}),
        ...(extremes && extremes.length > 0 ? { extremes: extremes.map((e) => ({ x: tidy(toDisplay(e.x, ctx.registry, xs![0]!.hint).value, xSpan), y: tidy(y(e.y), ySpan), peak: e.peak })) } : {}),
        ...(bends && bends.length > 0 ? { inflections: bends.map((e) => ({ x: tidy(toDisplay(e.x, ctx.registry, xs![0]!.hint).value, xSpan), y: tidy(y(e.y), ySpan) })) } : {}),
      };
    }),
    ...(place && Object.keys(place).length ? { place } : {}),
    ...(yRange ? { yRange } : {}),
    ...(area ? { area } : {}),
    ...(tangent ? { tangent } : {}),
    ...(labelOffsets ? { labelOffsets } : {}),
  };
}

type Curve = { readonly body: Expr; readonly name: string; readonly like: Quantity };

/** The integral in a formula of the sheet (S := integral(y(x), x: a .. b), also inside abs(…) or a product). */
function integralIn(expr: Expr | undefined): CallExpr | undefined {
  if (!expr) return undefined;
  if (expr.kind === 'call' && expr.name === 'integral' && expr.args.length === 1 && expr.named[0]?.value.kind === 'range') return expr;
  if (expr.kind === 'call') return expr.args.map(integralIn).find(Boolean);
  if (expr.kind === 'unary') return integralIn(expr.operand);
  if (expr.kind === 'binary') return integralIn(expr.left) ?? integralIn(expr.right);
  return undefined;
}

/** area: a .. b — the bounds in the unit of x, and ∫ y dx between them (Simpson's rule on 400 strips). */
function areaOf(call: CallExpr, curve: Curve, yDim: Dimension, ctx: EvalContext, evaluate: Evaluate, xIn: (q: Quantity) => number, y: (q: Quantity) => number, formulaOf?: (name: string) => Expr | undefined): PlotArea | undefined {
  const arg = call.named.find((n) => n.name === 'area');
  if (!arg) return undefined;
  // area: S, S := integral(y(x), x: x_2 .. x_1) (or abs(integral(…))): its bounds, its integrand, its name and value.
  if (arg.value.kind === 'variable') {
    const linked = integralIn(formulaOf?.(arg.value.name));
    if (!linked) return fail('E-PLOT-AREA', arg.value.span, {});
    const binder = linked.named[0]!;
    const range = binder.value as Extract<Expr, { kind: 'range' }>;
    const a = asQuantity(evaluate(range.low, ctx), range.low.span);
    const b = asQuantity(evaluate(range.high, ctx), range.high.span);
    const [lo, hi] = a.si <= b.si ? [a, b] : [b, a];
    const value = asQuantity(ctx.lookup(arg.value.name, arg.value.span), arg.value.span);
    const shown = toDisplay(value, ctx.registry);
    const n = 120;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k <= n; k++) {
      const x = { ...lo, si: lo.si + ((hi.si - lo.si) * k) / n };
      const v = evaluateAt(linked.args[0]!, binder.name, x, ctx, evaluate);
      if (v.type !== 'quantity' || v.im || !sameDim(v.dim, yDim)) return fail('E-PLOT-AREA', arg.value.span, {});
      xs.push(xIn(x));
      ys.push(y(v));
    }
    return { from: xIn(lo), to: xIn(hi), value: shown.value, unit: shown.unit, name: arg.value.name, xs, ys };
  }
  const r = arg.value;
  if (r.kind !== 'range') return fail('E-PLOT-AREA', r.span, {});
  const a = asQuantity(evaluate(r.low, ctx), r.low.span);
  const b = asQuantity(evaluate(r.high, ctx), r.high.span);
  for (const [q, at] of [[a, r.low], [b, r.high]] as const) {
    if (!sameDim(q.dim, curve.like.dim)) fail('E-UNIT-MISMATCH', at.span, { operator: '..', left: baseUnitSymbol(curve.like.dim), right: baseUnitSymbol(q.dim) });
  }
  const [lo, hi] = a.si <= b.si ? [a, b] : [b, a];
  const n = 400;
  const h = (hi.si - lo.si) / n;
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    const v = evaluateAt(curve.body, curve.name, { ...curve.like, si: lo.si + k * h }, ctx, evaluate);
    if (v.type !== 'quantity' || v.im) return fail('E-PLOT-AREA', r.span, {});
    sum += v.si * (k === 0 || k === n ? 1 : k % 2 === 1 ? 4 : 2);
  }
  const integral = quantity((sum * h) / 3, multiplyDims(yDim, curve.like.dim));
  const shown = toDisplay(integral, ctx.registry);
  return { from: xIn(lo), to: xIn(hi), value: shown.value, unit: shown.unit };
}

/** tangent: x₀ — the point of the first curve and its slope there (a central difference, in the units of the axes). */
function tangentOf(call: CallExpr, curve: Curve, ctx: EvalContext, evaluate: Evaluate, xIn: (q: Quantity) => number, y: (q: Quantity) => number): PlotTangent | undefined {
  const arg = call.named.find((n) => n.name === 'tangent');
  if (!arg) return undefined;
  const x0 = asQuantity(evaluate(arg.value, ctx), arg.value.span);
  if (!sameDim(x0.dim, curve.like.dim)) fail('E-UNIT-MISMATCH', arg.value.span, { operator: 'tangent', left: baseUnitSymbol(curve.like.dim), right: baseUnitSymbol(x0.dim) });
  const at = (si: number) => {
    const v = evaluateAt(curve.body, curve.name, { ...curve.like, si }, ctx, evaluate);
    return v.type === 'quantity' && !v.im ? v : fail('E-PLOT-FORM', arg.value.span, {});
  };
  const h = Math.max(Math.abs(x0.si), 1) * 1e-5;
  const [left, here, right] = [at(x0.si - h), at(x0.si), at(x0.si + h)];
  const dx = xIn({ ...x0, si: x0.si + h }) - xIn({ ...x0, si: x0.si - h });
  return { x: xIn(x0), y: y(here), slope: (y(right) - y(left)) / dx };
}

/**
 * Where a curve turns from bending one way to the other: the second differences of
 * its samples change sign there; refined by halving with the second derivative.
 */
function inflectionsOf(body: Expr, name: string, xs: readonly Quantity[], ctx: EvalContext, evaluate: Evaluate): { x: Quantity; y: Quantity }[] {
  const f = valueAt(body, name, xs[0]!, ctx, evaluate);
  const span = Math.abs(xs[xs.length - 1]!.si - xs[0]!.si);
  const h = span * 1e-3;
  const second = (si: number): number | undefined => {
    const [a, b, c] = [f(si - h)?.si, f(si)?.si, f(si + h)?.si];
    return a === undefined || b === undefined || c === undefined ? undefined : (a - 2 * b + c) / (h * h);
  };
  const scale = Math.max(...xs.map((q) => Math.abs(second(q.si) ?? 0)), Number.MIN_VALUE);
  const found: { x: Quantity; y: Quantity }[] = [];
  for (let j = 0; j + 1 < xs.length; j++) {
    const [s1, s2] = [second(xs[j]!.si), second(xs[j + 1]!.si)];
    // A real change of the bend, not noise around a straight piece.
    if (s1 === undefined || s2 === undefined || Math.sign(s1) === Math.sign(s2) || Math.max(Math.abs(s1), Math.abs(s2)) < scale * 1e-6) continue;
    let [lo, hi, slo] = [xs[j]!.si, xs[j + 1]!.si, s1];
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      const sm = second(mid);
      if (sm === undefined) break;
      if (Math.sign(sm) === Math.sign(slo)) [lo, slo] = [mid, sm];
      else hi = mid;
    }
    const x = (lo + hi) / 2;
    const yv = f(x);
    if (yv && !found.some((e) => Math.abs(e.x.si - x) <= span * 1e-6)) found.push({ x: { ...xs[0]!, si: x }, y: yv });
  }
  return found;
}

/** "e0.0=0,18 r0.1=-20,-5": the labels moved by hand. */
function parseLabelOffsets(text: string): Record<string, readonly [number, number]> {
  const out: Record<string, readonly [number, number]> = {};
  for (const item of text.split(/\s+/).filter(Boolean)) {
    const m = /^([a-z]+\d*(?:\.\d+)?)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(item);
    if (m) out[m[1]!] = [Number(m[2]), Number(m[3])];
  }
  return out;
}

/** A value rounded to a ten-millionth of the span of its axis. */
function tidy(value: number, span: number): number {
  if (!(span > 0) || !Number.isFinite(value)) return value;
  // A decimal step: −0,39999999 is −0,4, 2·10⁻⁸ is 0, −5,0000000001 is −5.
  const decimals = Math.max(0, Math.min(15, -Math.floor(Math.log10(span * 1e-7))));
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 ? 0 : rounded;
}

/** A yes/no option (roots: true). */
function flag(call: CallExpr, name: string, ctx: EvalContext, evaluate: Evaluate): boolean {
  const arg = call.named.find((n) => n.name === name);
  if (!arg) return false;
  const value = evaluate(arg.value, ctx);
  if (value.type !== 'boolean') return fail('E-TYPE', arg.value.span, { expected: 'boolean', found: value.type });
  return value.value;
}

/**
 * Where a curve is zero: between two samples of opposite signs (or at a sample
 * that is zero), refined by halving the step with the expression itself.
 */
function zeros(body: Expr, name: string, xs: readonly Quantity[], ys: readonly (Quantity | undefined)[], ctx: EvalContext, evaluate: Evaluate): Quantity[] {
  const at = (x: Quantity): number | undefined => {
    try {
      const v = evaluateAt(body, name, x, ctx, evaluate);
      return v.type === 'quantity' && !v.im && Number.isFinite(v.si) ? v.si : undefined;
    } catch (err) {
      if (err instanceof CalcError) return undefined;
      throw err;
    }
  };
  const found: Quantity[] = [];
  const add = (x: Quantity) => {
    if (!found.some((f) => Math.abs(f.si - x.si) <= Math.abs(xs[xs.length - 1]!.si - xs[0]!.si) * 1e-9)) found.push(x);
  };
  for (let j = 0; j < xs.length; j++) {
    const a = ys[j]?.si;
    if (a === undefined || ys[j]?.im) continue;
    if (a === 0) {
      add(xs[j]!);
      continue;
    }
    const b = ys[j + 1]?.si;
    if (b === undefined || j + 1 >= xs.length || Math.sign(a) === Math.sign(b) || b === 0) continue;
    let [lo, hi, flo] = [xs[j]!.si, xs[j + 1]!.si, a];
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      const fm = at({ ...xs[j]!, si: mid });
      if (fm === undefined) break;
      if (fm === 0 || Math.sign(fm) === Math.sign(flo)) [lo, flo] = [mid, fm];
      else hi = mid;
      if (fm === 0) hi = mid;
    }
    add({ ...xs[j]!, si: (lo + hi) / 2 });
  }
  return found;
}

/** The value of a curve at x (si), or undefined where it has none. */
function valueAt(body: Expr, name: string, like: Quantity, ctx: EvalContext, evaluate: Evaluate): (si: number) => Quantity | undefined {
  return (si) => {
    try {
      const v = evaluateAt(body, name, { ...like, si }, ctx, evaluate);
      return v.type === 'quantity' && !v.im && Number.isFinite(v.si) ? v : undefined;
    } catch (err) {
      if (err instanceof CalcError) return undefined;
      throw err;
    }
  };
}

/**
 * The peaks and dips of a curve (where its first derivative is zero, the vertex
 * of a parabola): found between the samples, made exact by a golden-section search.
 */
function extremesOf(body: Expr, name: string, xs: readonly Quantity[], ys: readonly (Quantity | undefined)[], ctx: EvalContext, evaluate: Evaluate): { x: Quantity; y: Quantity; peak: boolean }[] {
  const f = valueAt(body, name, xs[0]!, ctx, evaluate);
  const values = ys.map((q) => (q && !q.im ? q.si : undefined));
  const found: { x: Quantity; y: Quantity; peak: boolean }[] = [];
  for (let j = 1; j + 1 < xs.length; j++) {
    const [a, b, c] = [values[j - 1], values[j], values[j + 1]];
    if (a === undefined || b === undefined || c === undefined) continue;
    const peak = b >= a && b > c;
    const dip = b <= a && b < c;
    if (!peak && !dip) continue;
    let [l, r] = [xs[j - 1]!.si, xs[j + 1]!.si];
    const better = (p: number, q: number) => (peak ? p > q : p < q);
    for (let k = 0; k < 80; k++) {
      const m1 = l + (r - l) * 0.382;
      const m2 = l + (r - l) * 0.618;
      const f1 = f(m1)?.si;
      const f2 = f(m2)?.si;
      if (f1 === undefined || f2 === undefined) break;
      if (better(f1, f2)) r = m2;
      else l = m1;
    }
    const x = (l + r) / 2;
    const y = f(x);
    if (y && !found.some((e) => Math.abs(e.x.si - x) <= Math.abs(xs[xs.length - 1]!.si - xs[0]!.si) * 1e-6)) found.push({ x: { ...xs[0]!, si: x }, y, peak });
  }
  return found;
}

/**
 * The vertical lines a curve is symmetric about: at each of its peaks and dips,
 * kept only when the curve is the same on both sides of it over a good part of the chart.
 */
function symmetryAxes(body: Expr, name: string, xs: readonly Quantity[], ys: readonly (Quantity | undefined)[], ctx: EvalContext, evaluate: Evaluate): Quantity[] {
  const f = valueAt(body, name, xs[0]!, ctx, evaluate);
  const lo = xs[0]!.si;
  const hi = xs[xs.length - 1]!.si;
  const scale = Math.max(...ys.map((q) => Math.abs(q && !q.im ? q.si : 0)), Number.MIN_VALUE);
  return extremesOf(body, name, xs, ys, ctx, evaluate)
    .map((e) => e.x)
    .filter((x0) => {
      // The same on both sides over at least a fifth of the chart: else no axis worth drawing.
      const reach = Math.min(x0.si - lo, hi - x0.si);
      if (reach < (hi - lo) * 0.2) return false;
      return [0.2, 0.4, 0.6, 0.8, 1].every((share) => {
        const left = f(x0.si - reach * share)?.si;
        const right = f(x0.si + reach * share)?.si;
        return left !== undefined && right !== undefined && Math.abs(left - right) <= 1e-6 * scale;
      });
    });
}

/** ylim: low .. high, in the unit of the curves (or a pure number for pure numbers). */
function yLimits(call: CallExpr, yDim: Dimension, y: (q: Quantity) => number, ctx: EvalContext, evaluate: Evaluate): readonly [number, number] | undefined {
  const arg = call.named.find((n) => n.name === 'ylim');
  if (!arg) return undefined;
  const r = arg.value;
  if (r.kind !== 'range') return fail('E-PLOT-YLIM', r.span, {});
  const low = asQuantity(evaluate(r.low, ctx), r.low.span);
  const high = asQuantity(evaluate(r.high, ctx), r.high.span);
  for (const [q, at] of [[low, r.low], [high, r.high]] as const) {
    if (!sameDim(q.dim, yDim)) fail('E-PLOT-UNITS', at.span, { left: baseUnitSymbol(yDim, ctx.registry.baseSymbols()), right: baseUnitSymbol(q.dim, ctx.registry.baseSymbols()) });
  }
  const [a, b] = [y(low), y(high)];
  if (!(b > a)) return fail('E-PLOT-YLIM', r.span, {});
  return [a, b];
}

/** Points evenly across the range of measured x, for a smooth curve through them. */
function across(xs: readonly Quantity[]): Quantity[] {
  const values = xs.map((q) => q.si);
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const first = xs[0]!;
  const extra = { ...(first.hint ? { hint: first.hint } : {}), ...(first.absolute ? { absolute: true } : {}) };
  return Array.from({ length: LINE_SAMPLES }, (_, i) => quantity(low + ((high - low) * i) / (LINE_SAMPLES - 1), first.dim, extra));
}

/** A text option (kind: "bar", title: "Moment"). */
function option(call: CallExpr, name: string, ctx: EvalContext, evaluate: Evaluate): string | undefined {
  const arg = call.named.find((n) => n.name === name);
  if (!arg || name === 'samples') return undefined;
  const value = evaluate(arg.value, ctx);
  if (value.type !== 'text') return fail('E-TYPE', arg.value.span, { expected: 'text', found: value.type });
  return value.value;
}

/** The x of every point: an interval split evenly, or the items of a series. */
function samplePoints(binder: NamedArg, call: CallExpr, kind: PlotKind, ctx: EvalContext, evaluate: Evaluate): Quantity[] {
  const r = binder.value;
  if (r.kind !== 'range') {
    const value = evaluate(r, ctx);
    if (value.type !== 'vector' || value.items.length === 0) return fail('E-PLOT-FORM', r.span, {});
    return [...value.items];
  }
  const low = asQuantity(evaluate(r.low, ctx), r.low.span);
  const high = asQuantity(evaluate(r.high, ctx), r.high.span);
  if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', r.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
  if (!(high.si > low.si)) fail('E-PLOT-RANGE', r.span, {});
  const count = sampleCount(call, kind, ctx, evaluate);
  const hint = low.hint ?? high.hint;
  const extra = { ...(hint ? { hint } : {}), ...(low.absolute ? { absolute: true } : {}) };
  return Array.from({ length: count }, (_, i) => quantity(low.si + ((high.si - low.si) * i) / (count - 1), low.dim, extra));
}

function sampleCount(call: CallExpr, kind: PlotKind, ctx: EvalContext, evaluate: Evaluate): number {
  const arg = call.named.find((n) => n.name === 'samples');
  if (!arg) return kind === 'line' ? LINE_SAMPLES : MARK_SAMPLES;
  const value = asQuantity(evaluate(arg.value, ctx), arg.value.span);
  if (!Number.isInteger(value.si) || value.si < 2 || value.si > MAX_SAMPLES) fail('E-PLOT-SAMPLES', arg.value.span, { max: MAX_SAMPLES });
  return value.si;
}

/** The expression at x, with x its own variable (as in an integral). */
function evaluateAt(body: Expr, name: string, x: Quantity, ctx: EvalContext, evaluate: Evaluate): Value {
  const inner: EvalContext = { ...ctx, lookup: (n, at) => (n === name ? x : ctx.lookup(n, at)) };
  return evaluate(body, inner);
}

/** y at every x; a series that does not depend on x gives its items in order (data of a table). */
function curve(body: Expr, name: string, xs: readonly Quantity[], ctx: EvalContext, evaluate: Evaluate): (Quantity | undefined)[] {
  return xs.map((x, i) => {
    try {
      const value = evaluateAt(body, name, x, ctx, evaluate);
      if (value.type === 'vector') {
        if (value.items.length !== xs.length) fail('E-PLOT-LENGTH', body.span, {});
        return real(value.items[i]!, body.span);
      }
      return real(asQuantity(value, body.span), body.span);
    } catch (err) {
      // A missing dependency or a wrong form fails the chart; a value outside the domain (1/x at 0) is a gap.
      if (err instanceof CalcError && GAP_CODES.has(err.diagnostic.code)) return undefined;
      throw err;
    }
  });
}

/** Errors that leave a gap in a curve instead of failing it. */
const GAP_CODES: ReadonlySet<string> = new Set(['E-DIV-ZERO', 'E-DOMAIN', 'E-NOT-FINITE', 'E-COMPLEX-ARG']);

function series(arg: Expr, ctx: EvalContext, evaluate: Evaluate): (Quantity | undefined)[] {
  const value = evaluate(arg, ctx);
  if (value.type !== 'vector') return fail('E-PLOT-FORM', arg.span, {});
  return value.items.map((q) => real(q, arg.span));
}

function real(q: Quantity, span: Span): Quantity | undefined {
  if (q.im) fail('E-COMPLEX-ARG', span);
  return Number.isFinite(q.si) ? q : undefined;
}
