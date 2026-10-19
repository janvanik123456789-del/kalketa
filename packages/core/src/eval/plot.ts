/**
 * Charts of a sheet (docs/03-jazyk.md, ch. 7.1e): a line of its own that
 * samples expressions, the way an integral does, and hands the print layer
 * plain numbers in display units.
 *
 *   plot(M(x), x: 0 m .. L) | kN·m          a function over an interval
 *   plot(M(x), V(x)·1 m, x: 0 m .. L)       more curves, one y axis
 *   plot(Vyroba.E, x: Vyroba.mesic)         data: y for every x of a series
 *   plot(CF, kind: "bar")                   a series against its order
 *   plot(x^2 + y^2 == 25, x: -6 .. 6, y: -6 .. 6)   an implicit curve (also a relation by its name)
 *   plot(w(x, y), x: 0 m .. a, y: 0 m .. b)  a surface over x and y: a colour map with contour lines
 *   plot(w(x, y), x: …, y: …, kind: "surface", view: "az=35 el=30")   the same surface seen in 3D
 *
 * One chart has one y axis: curves of different dimensions are an error
 * (two charts, never a second axis).
 */

import { CalcError, DependencyFailed, diagnostic, fail, type DiagnosticCode, type Span } from '../diagnostics.js';
import type { Expr, NamedArg } from '../lang/ast.js';
import { parsePlacement, type Placement } from '../lang/parser.js';
import { isDimensionless, multiplyDims, sameDim, type Dimension } from '../units/dimension.js';
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
export type PlotKind = 'line' | 'points' | 'bar' | 'map' | 'surface';
const KINDS: readonly PlotKind[] = ['line', 'points', 'bar'];
/** Options of plot(...); every other named argument is the variable. */
export const PLOT_OPTIONS: readonly string[] = ['kind', 'title', 'samples', 'place', 'ylim', 'roots', 'symmetry', 'extremes', 'inflections', 'area', 'tangent', 'labels', 'points', 'style', 'levels', 'view'];
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
  /** An implicit curve (x² + y² = 25): its pieces one after another, NaN between them; x does not grow along it. */
  readonly implicit?: boolean;
}

/** area: a .. b — the area between the first curve and the x axis, hatched, with the value of its integral. */
export interface PlotArea {
  readonly from: number;
  readonly to: number;
  /** ∫ y dx from a to b (negative where the curve is below the axis) and its unit. */
  readonly value: number;
  readonly unit: string;
  /** The parts of the area above and below the x axis, each positive: ∫ y dx counts the one against the other. */
  readonly above?: number;
  readonly below?: number;
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

/**
 * A surface z(x, y) over a rectangle: its values on a grid, in the units of the axes and of z. The print
 * layer draws it as a colour map with contour lines (kind: "map").
 */
export interface PlotSurface {
  /** x of the columns and y of the rows of the grid, in the units of the axes. */
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  /** z[i][j] at xs[i], ys[j] in the unit of z; NaN where the expression has no value (a hole). */
  readonly z: readonly (readonly number[])[];
  readonly zUnit: string;
  /** levels: [10, 20] mm or levels: 8 — the values of the contour lines (a count: that many round ones). */
  readonly levels?: readonly number[];
  readonly levelCount?: number;
  /** view: "az=35 el=30" — from where a surface in 3D is seen (kind "surface"). */
  readonly view?: { readonly az: number; readonly el: number };
  /** extremes: true — the highest and the lowest point of the grid. */
  readonly extremes?: readonly { readonly x: number; readonly y: number; readonly z: number; readonly peak: boolean }[];
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
  /** With an implicit curve: the x axis over the whole range x: a .. b, and the name of the y axis (y: c .. d). */
  readonly xRange?: readonly [number, number];
  readonly yVariable?: string;
  /** Both axes at one scale (a circle round): they share a unit. The print layer sets the height of the chart so. */
  readonly equalScale?: boolean;
  readonly area?: PlotArea;
  readonly tangent?: PlotTangent;
  /** points: [x_v; y_v] or [x₁, y₁ | x₂, y₂] — points of the sheet, in the units of the axes. */
  readonly points?: readonly { readonly x: number; readonly y: number }[];
  /** style: "line=2.5 grid=y frame" — how the chart looks, over the style of charts of the calculation. */
  readonly style?: string;
  /** A surface over x and y (kind "map"): its grid of values. */
  readonly surface?: PlotSurface;
  /** labels: "e0.0=0,18 r0.1=-20,-5" — the labels moved by hand, by their key, in units of the chart. */
  readonly labelOffsets?: Readonly<Record<string, readonly [number, number]>>;
}

export function isPlotCall(expr: Expr): expr is CallExpr {
  return expr.kind === 'call' && expr.name === PLOT_FUNCTION;
}

/** A display line plot(...) | unit: samples every curve. */
export function plotStatement(given: CallExpr, ctx: EvalContext, evaluate: Evaluate, target: ResolvedUnit | undefined, formulaOf?: (name: string) => Expr | undefined): PlotResult {
  // area: S and points: V of a chart above their definitions: read there as units (siemens, volt), they are
  // the names the sheet defines below.
  const named = (e: Expr): Expr => (e.kind === 'unit' && e.unit.kind === 'unit-name' && (formulaOf?.(e.unit.name) ?? formulaOf?.(`#${e.unit.name}`)) ? { kind: 'variable', name: e.unit.name, span: e.span } : e);
  const call: CallExpr = { ...given, named: given.named.map((n) => (n.name === 'area' || n.name === 'points' ? { ...n, value: named(n.value) } : n)) };
  const binders = call.named.filter((n) => !PLOT_OPTIONS.includes(n.name));
  // An equation among the curves (x^2 + y^2 == 25, or a relation by its name) is an implicit curve over x and y.
  const implicit = call.args.map((arg) => equationOf(arg, formulaOf));
  const anyImplicit = implicit.some(Boolean);
  // One expression over two ranges, not an equation: a surface z(x, y).
  if (!anyImplicit && binders.length >= 2 && call.args.length === 1 && binders[0]!.value.kind === 'range' && binders[1]!.value.kind === 'range') return surfaceStatement(call, binders, ctx, evaluate, target);
  const extra = binders[anyImplicit ? 2 : 1];
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: call.name, argument: extra.name, problem: 'unknown' });
  if (call.args.length === 0) fail('E-PLOT-FORM', call.span, {});
  const yBinder = anyImplicit ? binders[1] : undefined;
  if (anyImplicit && (binders[0]?.value.kind !== 'range' || yBinder?.value.kind !== 'range')) fail('E-PLOT-IMPLICIT', call.span, {});
  if (call.args.length > MAX_PLOT_SERIES) fail('E-PLOT-SERIES', call.args[MAX_PLOT_SERIES]!.span, { max: MAX_PLOT_SERIES });
  const kind = option(call, 'kind', ctx, evaluate);
  const plotKind = (kind ?? 'line') as PlotKind;
  if (!KINDS.includes(plotKind)) fail('E-PLOT-KIND', call.named.find((n) => n.name === 'kind')!.value.span, { kind: kind ?? '' });
  const title = option(call, 'title', ctx, evaluate);
  const placeText = option(call, 'place', ctx, evaluate);
  const style = option(call, 'style', ctx, evaluate);
  const place = placeText === undefined ? undefined : parsePlacement(placeText);
  // A chart has no lines of its own to stand beside: side= is for pictures.
  if (placeText !== undefined && (!place || place.side)) fail('E-PLOT-POSITION', call.named.find((n) => n.name === 'place')!.value.span, { place: placeText });
  const binder = binders[0];
  const xs = binder ? samplePoints(binder, call, plotKind, ctx, evaluate) : undefined;

  // Over measured x (a series, not a range) a line chart shows the data as points and a
  // function of x (a fitted curve) as a line through their whole range.
  const dense = xs && binder && binder.value.kind !== 'range' && plotKind === 'line' && xs.length > 1 && !isDate(xs[0]!) ? across(xs) : undefined;
  // y of every curve at every point; a point without a value is a gap, not a failed chart.
  const yBounds = yBinder ? rangeOf(yBinder, ctx, evaluate) : undefined;
  const contours = implicit.map((eq, i) => (eq ? contourOf(eq, binder!.name, yBinder!.name, xs![0]!, xs![xs!.length - 1]!, yBounds![0], yBounds![1], ctx, evaluate, call.args[i]!.span) : undefined));
  const drawn = call.args.map((arg, i) => {
    if (implicit[i]) return { at: undefined, values: [] as (Quantity | undefined)[], mark: undefined };
    if (!xs) return { at: undefined, values: series(arg, ctx, evaluate), mark: undefined };
    if (dense && freeNames(arg, new Set()).has(binder!.name)) return { at: dense, values: curve(arg, binder!.name, dense, ctx, evaluate), mark: 'line' as const };
    return { at: xs, values: curve(arg, binder!.name, xs, ctx, evaluate), mark: dense ? ('points' as const) : undefined };
  });
  const columns = drawn.map((d) => d.values);
  const ys = columns.flat().find((q): q is Quantity => q !== undefined) ?? yBounds?.[0];
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
  // The parts of a chart beyond its curves (an area, points, a tangent, the y axis by hand) are drawn where they can
  // be calculated: outside the domain of a part (no real roots with D < 0, so no area between them) the chart
  // goes on without it, and says so.
  const optional = <T>(name: string, code: DiagnosticCode, part: () => T): T | undefined => {
    if (!call.named.some((n) => n.name === name)) return undefined;
    try {
      return part();
    } catch (err) {
      if (!(err instanceof CalcError) && !(err instanceof DependencyFailed)) throw err;
      // A part written wrong stays an error to mend; one that cannot be calculated now is left out.
      if (err instanceof CalcError && WRITTEN_WRONG.has(err.diagnostic.code)) throw err;
      const at = call.named.find((n) => n.name === name)!.value.span;
      const reason = err instanceof DependencyFailed ? err.variable : '';
      ctx.warnings.push(diagnostic(code, at, { name: reason || source(call, name) }));
      return undefined;
    }
  };
  const asked = optional('ylim', 'W-PLOT-NO-YLIM', () => yLimits(call, yDim, y, ctx, evaluate));
  // The y axis set by hand would hide the curves (other coefficients moved them out of it): the axis follows
  // the values instead, until the curves come back into the range.
  const inRange = (range: readonly [number, number]) => {
    const all = columns.flat().filter((q): q is Quantity => !!q && !q.im).map((q) => y(q));
    if (all.length === 0) return anyImplicit;
    return all.filter((v) => v >= range[0] && v <= range[1]).length / all.length >= 0.05;
  };
  const yRange = asked && !inRange(asked) ? undefined : asked;
  if (asked && !yRange) ctx.warnings.push(diagnostic('W-PLOT-YLIM-HIDES', call.named.find((n) => n.name === 'ylim')!.value.span, {}));
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
  const first = binder?.value.kind === 'range' && xs && !implicit[0] ? { body: call.args[0]!, name: binder.name, like: xs[0]! } : undefined;
  const xIn = (q: Quantity) => toDisplay(q, ctx.registry, xs?.[0]?.hint).value;
  const area = first ? optional('area', 'W-PLOT-NO-AREA', () => areaOf(call, first, yDim, ctx, evaluate, xIn, y, formulaOf)) : undefined;
  const tangent = first ? optional('tangent', 'W-PLOT-NO-TANGENT', () => tangentOf(call, first, ctx, evaluate, xIn, y)) : undefined;
  const points = first ? optional('points', 'W-PLOT-NO-POINTS', () => pointsOf(call, first.like.dim, yDim, ctx, evaluate, xIn, y)) : undefined;
  const labelText = option(call, 'labels', ctx, evaluate);
  const labelOffsets = labelText ? parseLabelOffsets(labelText) : undefined;
  // A point found by searching is exact to some 8 digits: shown at the precision the chart has (2,1·10⁻⁸ is 0).
  const xSpan = x.values.length > 1 ? Math.abs(x.values[x.values.length - 1]! - x.values[0]!) : 1;
  const ySpan = Math.max(...columns.flat().map((q) => (q ? Math.abs(y(q)) : 0))) || 1;
  return {
    kind: plotKind,
    ...(title !== undefined ? { title } : {}),
    ...(style ? { style } : {}),
    variable: binder?.name ?? '',
    xUnit: x.unit,
    yUnit: yUnitSymbol,
    ...(x.dates ? { xDates: true } : {}),
    series: drawn.map((d, i) => {
      const pieces = contours[i];
      if (pieces) {
        const xOf = (si: number) => (Number.isNaN(si) ? NaN : xIn({ ...xs![0]!, si }));
        const yOf = (si: number) => (Number.isNaN(si) ? NaN : y({ ...yBounds![0], si }));
        return { xs: pieces.xs.map(xOf), ys: pieces.ys.map(yOf), implicit: true };
      }
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
    // An implicit curve over the whole x: a .. b, y: c .. d as written; the axes at one scale where they share a unit.
    ...(anyImplicit && !yRange && !asked ? { yRange: [y(yBounds![0]), y(yBounds![1])] as const } : {}),
    ...(anyImplicit ? { xRange: [x.values[0]!, x.values[x.values.length - 1]!] as const, yVariable: yBinder!.name } : {}),
    ...(anyImplicit && x.unit === yUnitSymbol ? { equalScale: true } : {}),
    ...(area ? { area } : {}),
    ...(tangent ? { tangent } : {}),
    ...(labelOffsets ? { labelOffsets } : {}),
    ...(points && points.length > 0 ? { points } : {}),
  };
}

type Curve = { readonly body: Expr; readonly name: string; readonly like: Quantity };

/**
 * The parts of an area above and below the x axis, each positive: the trapezoids of the
 * samples, cut where the curve crosses the axis. Scaled so that their difference is the
 * integral as calculated (in its unit); none when the curve stays on one side.
 */
function parts(xs: readonly number[], ys: readonly number[], integral: number): { above?: number; below?: number } {
  let above = 0;
  let below = 0;
  for (let k = 0; k + 1 < xs.length; k++) {
    const [x1, x2, y1, y2] = [xs[k]!, xs[k + 1]!, ys[k]!, ys[k + 1]!];
    if (y1 >= 0 && y2 >= 0) above += ((y1 + y2) / 2) * (x2 - x1);
    else if (y1 <= 0 && y2 <= 0) below -= ((y1 + y2) / 2) * (x2 - x1);
    else {
      // The crossing between them: a triangle on each side.
      const xc = x1 + ((x2 - x1) * y1) / (y1 - y2);
      const [a, b] = y1 > 0 ? [(y1 * (xc - x1)) / 2, (-y2 * (x2 - xc)) / 2] : [(y2 * (x2 - xc)) / 2, (-y1 * (xc - x1)) / 2];
      above += a;
      below += b;
    }
  }
  const total = above - below;
  if (above <= Math.abs(total) * 1e-9 || below <= Math.abs(total) * 1e-9 || !(Math.abs(total) > 0)) return {};
  // In the unit of the integral: the chart reads the axes in theirs.
  const scale = integral / total;
  return { above: Math.abs(above * scale), below: Math.abs(below * scale) };
}

/** points: a vector [x; y] or a matrix of rows [x₁, y₁ | x₂, y₂] — points of the sheet to mark. */
function pointsOf(call: CallExpr, xDim: Dimension, yDim: Dimension, ctx: EvalContext, evaluate: Evaluate, xIn: (q: Quantity) => number, y: (q: Quantity) => number): { x: number; y: number }[] | undefined {
  const arg = call.named.find((n) => n.name === 'points');
  if (!arg) return undefined;
  const v = evaluate(arg.value, ctx);
  const pairs = v.type === 'vector' && v.items.length === 2 ? [[v.items[0]!, v.items[1]!]] : v.type === 'matrix' && v.cols === 2 ? Array.from({ length: v.rows }, (_, i) => [v.items[2 * i]!, v.items[2 * i + 1]!]) : undefined;
  if (!pairs) return fail('E-PLOT-POINTS', arg.value.span, {});
  return pairs.map(([px, py]) => {
    if (!sameDim(px!.dim, xDim) || !sameDim(py!.dim, yDim) || px!.im || py!.im) fail('E-PLOT-POINTS', arg.value.span, {});
    return { x: xIn(px!), y: y(py!) };
  });
}

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
    // A name of the sheet (P := integral(…)) or the name of a formula ({eq=Integral1}).
    const own = formulaOf?.(arg.value.name);
    const key = own ? arg.value.name : `#${arg.value.name}`;
    const linked = integralIn(own ?? formulaOf?.(key));
    if (!linked) return fail('E-PLOT-AREA', arg.value.span, {});
    const binder = linked.named[0]!;
    const range = binder.value as Extract<Expr, { kind: 'range' }>;
    const a = asQuantity(evaluate(range.low, ctx), range.low.span);
    const b = asQuantity(evaluate(range.high, ctx), range.high.span);
    const [lo, hi] = a.si <= b.si ? [a, b] : [b, a];
    // Its value as the sheet has it; a formula below the chart is not calculated yet: calculated here, the same way.
    let value: Quantity;
    try {
      value = asQuantity(ctx.lookup(key, arg.value.span), arg.value.span);
    } catch (err) {
      if (!(err instanceof CalcError) || !['E-DEFINED-LATER', 'E-UNDEFINED'].includes(err.diagnostic.code)) throw err;
      value = asQuantity(evaluate(own ?? formulaOf!(key)!, ctx), arg.value.span);
    }
    const shown = toDisplay(value, ctx.registry);
    const n = 120;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k <= n; k++) {
      const x = { ...lo, si: lo.si + ((hi.si - lo.si) * k) / n };
      const v = evaluateAt(linked.args[0]!, binder.name, x, ctx, evaluate);
      if (v.type !== 'quantity' || !sameDim(v.dim, yDim)) return fail('E-PLOT-AREA', arg.value.span, {});
      if (v.im || !Number.isFinite(v.si)) return fail('E-NOT-FINITE', arg.value.span);
      xs.push(xIn(x));
      ys.push(y(v));
    }
    return { from: xIn(lo), to: xIn(hi), value: shown.value, unit: shown.unit, name: arg.value.name, xs, ys, ...parts(xs, ys, shown.value) };
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
    if (v.type !== 'quantity') return fail('E-PLOT-AREA', r.span, {});
    if (v.im || !Number.isFinite(v.si)) return fail('E-NOT-FINITE', r.span);
    sum += v.si * (k === 0 || k === n ? 1 : k % 2 === 1 ? 4 : 2);
  }
  const integral = quantity((sum * h) / 3, multiplyDims(yDim, curve.like.dim));
  const shown = toDisplay(integral, ctx.registry);
  // The parts above and below the axis, from the curve at fine steps.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k <= 800; k++) {
    const x = { ...curve.like, si: lo.si + ((hi.si - lo.si) * k) / 800 };
    const v = evaluateAt(curve.body, curve.name, x, ctx, evaluate);
    if (v.type !== 'quantity') return fail('E-PLOT-AREA', r.span, {});
    if (v.im || !Number.isFinite(v.si)) return fail('E-NOT-FINITE', r.span);
    xs.push(xIn(x));
    ys.push(y(v));
  }
  return { from: xIn(lo), to: xIn(hi), value: shown.value, unit: shown.unit, ...parts(xs, ys, shown.value) };
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

/** Errors of how a part of a chart is written (not of its values): they stay errors. */
const WRITTEN_WRONG: ReadonlySet<string> = new Set(['E-PLOT-YLIM', 'E-PLOT-POINTS', 'E-PLOT-AREA', 'E-PLOT-UNITS', 'E-UNIT-MISMATCH', 'E-TYPE']);

/** An option of the call as written (area: x_2 .. x_1 gives "x_2 .. x_1"), short. */
function source(call: CallExpr, name: string): string {
  const v = call.named.find((n) => n.name === name)?.value;
  return v?.kind === 'variable' ? v.name : v?.kind === 'range' && v.low.kind === 'variable' ? v.low.name : '';
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

/** Cells of the grid of a surface along each axis, unless samples: says otherwise. */
const SURFACE_CELLS = 50;
const MAX_SURFACE_CELLS = 200;

/** plot(z(x, y), x: a .. b, y: c .. d): the values of z on a grid over the rectangle, holes where it has none. */
function surfaceStatement(call: CallExpr, binders: readonly NamedArg[], ctx: EvalContext, evaluate: Evaluate, target: ResolvedUnit | undefined): PlotResult {
  const [xBinder, yBinder] = [binders[0]!, binders[1]!];
  const extra = binders[2];
  if (extra) fail('E-NAMED-ARG', extra.nameSpan, { function: call.name, argument: extra.name, problem: 'unknown' });
  const kind = option(call, 'kind', ctx, evaluate);
  if (kind !== undefined && kind !== 'map' && kind !== 'surface') fail('E-PLOT-KIND', call.named.find((n) => n.name === 'kind')!.value.span, { kind });
  // Seen in 3D: from where (az round the vertical, el above the floor, in degrees), as dragged in the editor.
  const viewText = option(call, 'view', ctx, evaluate);
  const view = viewText === undefined ? undefined : parseView(viewText);
  if (viewText !== undefined && !view) fail('E-PLOT-VIEW', call.named.find((n) => n.name === 'view')!.value.span, { view: viewText });
  const title = option(call, 'title', ctx, evaluate);
  const style = option(call, 'style', ctx, evaluate);
  const placeText = option(call, 'place', ctx, evaluate);
  const place = placeText === undefined ? undefined : parsePlacement(placeText);
  if (placeText !== undefined && (!place || place.side)) fail('E-PLOT-POSITION', call.named.find((n) => n.name === 'place')!.value.span, { place: placeText });
  const cellsArg = call.named.find((n) => n.name === 'samples');
  let cells = SURFACE_CELLS;
  if (cellsArg) {
    const value = asQuantity(evaluate(cellsArg.value, ctx), cellsArg.value.span);
    if (!Number.isInteger(value.si) || value.si < 2 || value.si > MAX_SURFACE_CELLS) fail('E-PLOT-SAMPLES', cellsArg.value.span, { max: MAX_SURFACE_CELLS });
    cells = value.si;
  }
  const [x0, x1] = rangeOf(xBinder, ctx, evaluate);
  const [y0, y1] = rangeOf(yBinder, ctx, evaluate);
  const at = (q: Quantity, si: number): Quantity => ({ ...q, si });
  const body = call.args[0]!;
  // z at every point of the grid; a point without a value is a hole, not a failed chart.
  const grid: (Quantity | undefined)[][] = [];
  for (let i = 0; i <= cells; i++) {
    const x = at(x0, x0.si + ((x1.si - x0.si) * i) / cells);
    const column: (Quantity | undefined)[] = [];
    for (let j = 0; j <= cells; j++) {
      const y = at(y0, y0.si + ((y1.si - y0.si) * j) / cells);
      const inner: EvalContext = { ...ctx, lookup: (n, where) => (n === xBinder.name ? x : n === yBinder.name ? y : ctx.lookup(n, where)) };
      try {
        const value = evaluate(body, inner);
        if (value.type !== 'quantity') return fail('E-PLOT-FORM', body.span, {});
        column.push(real(value, body.span));
      } catch (err) {
        if (err instanceof CalcError && GAP_CODES.has(err.diagnostic.code)) column.push(undefined);
        else throw err;
      }
    }
    grid.push(column);
  }
  const first = grid.flat().find((q): q is Quantity => q !== undefined);
  if (!first) return fail('E-PLOT-FORM', body.span, {});
  const other = grid.flat().find((q) => q && !sameDim(q.dim, first.dim));
  if (other) fail('E-PLOT-UNITS', body.span, { left: baseUnitSymbol(first.dim, ctx.registry.baseSymbols()), right: baseUnitSymbol(other.dim, ctx.registry.baseSymbols()) });
  if (target && !sameDim(target.dim, first.dim)) throw new CalcError(diagnostic('E-TARGET-UNIT', call.span, { unit: target.symbol, found: baseUnitSymbol(first.dim) }));
  const zUnit = target ?? first.hint;
  const z = grid.map((column) => column.map((q) => (q ? toDisplay(q, ctx.registry, zUnit).value : NaN)));
  const xShown = (si: number) => toDisplay(at(x0, si), ctx.registry, x0.hint ?? x1.hint);
  const yShown = (si: number) => toDisplay(at(y0, si), ctx.registry, y0.hint ?? y1.hint);
  const xs = Array.from({ length: cells + 1 }, (_, i) => xShown(x0.si + ((x1.si - x0.si) * i) / cells).value);
  const ys = Array.from({ length: cells + 1 }, (_, j) => yShown(y0.si + ((y1.si - y0.si) * j) / cells).value);
  const xUnit = xShown(x0.si).unit;
  const yUnit = yShown(y0.si).unit;
  // The levels of the contour lines: values of z, or how many round ones.
  const levelsArg = call.named.find((n) => n.name === 'levels');
  let levels: number[] | undefined;
  let levelCount: number | undefined;
  if (levelsArg) {
    const value = evaluate(levelsArg.value, ctx);
    const items = value.type === 'vector' ? value.items : value.type === 'quantity' ? [value] : undefined;
    if (!items || items.length === 0) return fail('E-PLOT-LEVELS', levelsArg.value.span, {});
    const count = value.type === 'quantity' && isDimensionless(value.dim) ? value.si : undefined;
    if (count !== undefined) {
      if (!Number.isInteger(count) || count < 1 || count > 50) fail('E-PLOT-LEVELS', levelsArg.value.span, {});
      levelCount = count;
    } else {
      if (items.some((q) => !sameDim(q.dim, first.dim) || q.im)) fail('E-PLOT-LEVELS', levelsArg.value.span, {});
      levels = items.map((q) => toDisplay(q, ctx.registry, zUnit).value).sort((a, b) => a - b);
    }
  }
  // The highest and the lowest point of the grid.
  let extremes: { x: number; y: number; z: number; peak: boolean }[] | undefined;
  if (flag(call, 'extremes', ctx, evaluate)) {
    let hi: [number, number] | undefined;
    let lo: [number, number] | undefined;
    z.forEach((column, i) =>
      column.forEach((v, j) => {
        if (!Number.isFinite(v)) return;
        if (!hi || v > z[hi[0]]![hi[1]]!) hi = [i, j];
        if (!lo || v < z[lo[0]]![lo[1]]!) lo = [i, j];
      }),
    );
    const span = Math.max(...z.flat().filter(Number.isFinite).map(Math.abs)) || 1;
    extremes = [hi, lo].flatMap((p, k) => (p ? [{ x: xs[p[0]]!, y: ys[p[1]]!, z: tidy(z[p[0]]![p[1]]!, span), peak: k === 0 }] : []));
    if (extremes.length === 2 && extremes[0]!.z === extremes[1]!.z) extremes = extremes.slice(0, 1);
  }
  return {
    kind: kind === 'surface' ? 'surface' : 'map',
    ...(title !== undefined ? { title } : {}),
    ...(style ? { style } : {}),
    variable: xBinder.name,
    yVariable: yBinder.name,
    xUnit,
    yUnit,
    series: [],
    xRange: [xs[0]!, xs[xs.length - 1]!],
    yRange: [ys[0]!, ys[ys.length - 1]!],
    // A plate of 4 m by 2 m is drawn twice as wide as high: both axes at one scale where they share a unit.
    ...(xUnit === yUnit ? { equalScale: true } : {}),
    ...(place && Object.keys(place).length ? { place } : {}),
    surface: {
      xs,
      ys,
      z,
      zUnit: toDisplay(first, ctx.registry, zUnit).unit,
      ...(levels ? { levels } : {}),
      ...(levelCount !== undefined ? { levelCount } : {}),
      ...(extremes && extremes.length > 0 ? { extremes } : {}),
      ...(view ? { view } : {}),
    },
  };
}

/** view: "az=35 el=30" — azimuth round the vertical (−180 .. 180) and elevation above the floor (0 .. 90), degrees. */
function parseView(text: string): { az: number; el: number } | undefined {
  const az = /\baz\s*=\s*(-?\d+(?:[.,]\d+)?)/.exec(text)?.[1];
  const el = /\bel\s*=\s*(-?\d+(?:[.,]\d+)?)/.exec(text)?.[1];
  if (az === undefined && el === undefined) return undefined;
  const a = az === undefined ? 35 : Number(az.replace(',', '.'));
  const e = el === undefined ? 30 : Number(el.replace(',', '.'));
  if (!(e >= 0 && e <= 90)) return undefined;
  return { az: ((((a + 180) % 360) + 360) % 360) - 180, el: e };
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

/** An equation as a curve: x^2 + y^2 == 25, or the name of a relation of the sheet (relation … {eq=Kruh}). */
function equationOf(arg: Expr, formulaOf?: (name: string) => Expr | undefined): { left: Expr; right: Expr } | undefined {
  if (arg.kind === 'binary' && arg.operator === '==') return arg;
  const name = arg.kind === 'variable' ? arg.name : arg.kind === 'unit' && arg.unit.kind === 'unit-name' ? arg.unit.name : undefined;
  const own = name === undefined ? undefined : formulaOf?.(`#${name}`);
  return own?.kind === 'binary' && own.operator === '==' ? own : undefined;
}

/** low .. high of a range given to a chart. */
function rangeOf(binder: NamedArg, ctx: EvalContext, evaluate: Evaluate): [Quantity, Quantity] {
  const r = binder.value as Extract<Expr, { kind: 'range' }>;
  const low = asQuantity(evaluate(r.low, ctx), r.low.span);
  const high = asQuantity(evaluate(r.high, ctx), r.high.span);
  if (!sameDim(low.dim, high.dim)) fail('E-UNIT-MISMATCH', r.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
  if (!(high.si > low.si)) fail('E-PLOT-RANGE', r.span, {});
  return [low, high];
}

/** Squares of the grid an implicit curve is looked for in, along each axis. */
const CONTOUR_CELLS = 100;

/**
 * Where left == right over the rectangle x0 .. x1, y0 .. y1 (SI): the sign of left − right on a grid,
 * the curve through the squares where it changes (marching squares), its pieces joined into lines.
 * A change of sign across a pole (y = 1/x at x = 0) is no curve: left out.
 */
function contourOf(eq: { left: Expr; right: Expr }, xName: string, yName: string, x0: Quantity, x1: Quantity, y0: Quantity, y1: Quantity, ctx: EvalContext, evaluate: Evaluate, span: Span): { xs: number[]; ys: number[] } {
  const n = CONTOUR_CELLS;
  let checked = false;
  const f = (x: number, y: number): number | undefined => {
    const inner: EvalContext = { ...ctx, lookup: (name, at) => (name === xName ? { ...x0, si: x } : name === yName ? { ...y0, si: y } : ctx.lookup(name, at)) };
    try {
      const l = evaluate(eq.left, inner);
      const r = evaluate(eq.right, inner);
      if (l.type !== 'quantity' || r.type !== 'quantity') return fail('E-PLOT-IMPLICIT', span, {});
      if (!checked) {
        if (!sameDim(l.dim, r.dim)) fail('E-PLOT-IMPLICIT', span, {});
        checked = true;
      }
      const v = l.si - r.si;
      return l.im || r.im || !Number.isFinite(v) ? undefined : v;
    } catch (err) {
      if (err instanceof CalcError && GAP_CODES.has(err.diagnostic.code)) return undefined;
      throw err;
    }
  };
  const xAt = (i: number) => x0.si + ((x1.si - x0.si) * i) / n;
  const yAt = (j: number) => y0.si + ((y1.si - y0.si) * j) / n;
  const grid: (number | undefined)[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => f(xAt(i), yAt(j))));
  if (!checked) return fail('E-PLOT-FORM', span, {});
  // A point on an edge where the sign changes, by name of the edge: h i,j from (i, j) to (i+1, j); v i,j from (i, j) to (i, j+1).
  const points = new Map<string, [number, number]>();
  const links = new Map<string, string[]>();
  const crossing = (key: string, xa: number, ya: number, va: number, xb: number, yb: number, vb: number): boolean => {
    if (points.has(key)) return true;
    const t = va / (va - vb);
    const [px, py] = [xa + (xb - xa) * t, ya + (yb - ya) * t];
    // Across a pole the value there is not small: no curve passes.
    const here = f(px, py);
    if (here === undefined || Math.abs(here) > 0.25 * (Math.abs(va) + Math.abs(vb))) return false;
    points.set(key, [px, py]);
    return true;
  };
  const link = (a: string, b: string) => {
    links.set(a, [...(links.get(a) ?? []), b]);
    links.set(b, [...(links.get(b) ?? []), a]);
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [a, b, c, d] = [grid[i]![j], grid[i + 1]![j], grid[i + 1]![j + 1], grid[i]![j + 1]];
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      const up = (v: number) => v >= 0;
      const edges: string[] = [];
      const bottom = `h${i},${j}`;
      const right = `v${i + 1},${j}`;
      const top = `h${i},${j + 1}`;
      const left = `v${i},${j}`;
      // The edges where the sign changes, each with its point; a cell crossed by a pole is left out.
      const sides: [string, number, number, number, number, number, number][] = [
        [bottom, xAt(i), yAt(j), a, xAt(i + 1), yAt(j), b],
        [right, xAt(i + 1), yAt(j), b, xAt(i + 1), yAt(j + 1), c],
        [top, xAt(i), yAt(j + 1), d, xAt(i + 1), yAt(j + 1), c],
        [left, xAt(i), yAt(j), a, xAt(i), yAt(j + 1), d],
      ];
      let fine = true;
      for (const [key, xa, ya, va, xb, yb, vb] of sides) {
        if (up(va) === up(vb)) continue;
        if (!crossing(key, xa, ya, va, xb, yb, vb)) fine = false;
        edges.push(key);
      }
      if (!fine) continue;
      if (edges.length === 2) link(edges[0]!, edges[1]!);
      else if (edges.length === 4) {
        // A saddle: the middle decides which corners the curve keeps together.
        const middle = (a + b + c + d) / 4;
        if (up(middle) === up(a)) {
          link(bottom, right);
          link(top, left);
        } else {
          link(bottom, left);
          link(right, top);
        }
      }
    }
  }
  // The pieces as lines: from an open end first, then the closed ones (a circle).
  const xs: number[] = [];
  const ys: number[] = [];
  const used = new Set<string>();
  const walk = (start: string) => {
    if (xs.length > 0) {
      xs.push(NaN);
      ys.push(NaN);
    }
    let at: string | undefined = start;
    let from: string | undefined;
    while (at && !used.has(at)) {
      used.add(at);
      const [px, py] = points.get(at)!;
      xs.push(px);
      ys.push(py);
      const next: string | undefined = (links.get(at) ?? []).find((k) => k !== from && !used.has(k));
      [from, at] = [at, next];
    }
    // A closed piece ends where it began.
    if (at === undefined && from && (links.get(from) ?? []).includes(start) && (links.get(start)?.length ?? 0) > 1) {
      const [px, py] = points.get(start)!;
      xs.push(px);
      ys.push(py);
    }
  };
  for (const [key, near] of links) if (near.length === 1 && !used.has(key) && points.has(key)) walk(key);
  for (const key of links.keys()) if (!used.has(key) && points.has(key)) walk(key);
  return { xs, ys };
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
