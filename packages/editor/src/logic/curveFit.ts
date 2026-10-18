/**
 * Insert > Fit a curve…: what the dialog offers and the lines it writes.
 * The lines are ordinary lines of the sheet (fit, polyfit, interp1, spline, pchip and a plot),
 * so the user can go on editing them by hand.
 */

import type { SheetResult, Value } from '@kalketa/core';

/** How a curve goes with the points: through them all (interpolate) or near them (approximate). */
export type FitMethod = 'line' | 'poly' | 'exp' | 'power' | 'log' | 'polyline' | 'spline' | 'pchip' | 'lagrange';

export const APPROXIMATE: readonly FitMethod[] = ['line', 'poly', 'exp', 'power', 'log'];
export const INTERPOLATE: readonly FitMethod[] = ['polyline', 'spline', 'pchip', 'lagrange'];

/** A series of the sheet to fit: a numeric column of a table (Mereni.T) or a series of numbers (Y). */
export interface FitSeries {
  /** As written in the sheet. */
  readonly expr: string;
  readonly length: number;
  /** The name the parameter of the curve takes from it (T of Mereni.T); undefined for a series of its own. */
  readonly column?: string;
  /** Every value above zero (a logarithm of it means something). */
  readonly positive: boolean;
  /** An absolute temperature (°C): no logarithm of it. */
  readonly absolute: boolean;
}

export interface FitChoice {
  readonly x: FitSeries;
  readonly y: FitSeries;
  readonly method: FitMethod;
  /** Degree of a polynomial (poly), 2 … 10. */
  readonly degree: number;
  /** Name of the curve: a function of the sheet. */
  readonly name: string;
  /** The method written out as on paper (line, poly). */
  readonly steps: boolean;
  /** A chart of the points and the curve below it. */
  readonly chart: boolean;
}

/** The highest degree of a polynomial (as the core takes it). */
export const MAX_DEGREE = 10;

/**
 * Whether a method goes with these points: an approximation needs a point more than coefficients,
 * the logarithmic kinds need values above zero (exp of y, power of both, log of x) and no °C on x.
 */
export function fits(method: FitMethod, x: FitSeries, y: FitSeries, degree = 2): boolean {
  const points = Math.min(x.length, y.length);
  if (points < 2 || x.length !== y.length) return false;
  switch (method) {
    case 'line':
      return points >= 3;
    case 'exp':
      return points >= 3 && y.positive;
    case 'power':
      return points >= 3 && y.positive && x.positive && !x.absolute;
    case 'log':
      return points >= 3 && x.positive && !x.absolute;
    case 'poly':
      return points >= degree + 2;
    case 'lagrange':
      return points - 1 <= MAX_DEGREE;
    default:
      return true;
  }
}

/** Methods that can write their steps out (the least squares of a line and a polynomial). */
export function hasSteps(method: FitMethod): boolean {
  return method === 'line' || method === 'poly';
}

/** The numeric series the sheet offers: columns of its tables and series of numbers, in sheet order. */
export function fitSeries(result: SheetResult): FitSeries[] {
  const out: FitSeries[] = [];
  const numeric = (cells: readonly (Value | null)[]) => cells.length >= 2 && cells.every((c) => c?.type === 'quantity');
  const traits = (cells: readonly (Value | null)[]) => ({
    positive: cells.every((c) => c?.type === 'quantity' && c.si > 0),
    absolute: cells.some((c) => c?.type === 'quantity' && !!c.absolute),
  });
  const seen = new Set<string>();
  const table = (name: string, columns: readonly { readonly name: string }[], rows: readonly (readonly (Value | null)[])[]) => {
    if (seen.has(name)) return;
    seen.add(name);
    columns.forEach((c, i) => {
      const cells = rows.map((r) => r[i] ?? null);
      if (numeric(cells)) out.push({ expr: `${name}.${c.name}`, length: cells.length, column: c.name, ...traits(cells) });
    });
  };
  for (const [name, value] of result.values) {
    if (value.type === 'table') table(name, value.table.columns, value.table.rows);
    else if (value.type === 'vector' && numeric(value.items)) out.push({ expr: name, length: value.items.length, ...traits(value.items) });
  }
  for (const [name, t] of result.tables) table(name, t.columns, t.rows);
  return out;
}

/** The variable of the curve: the column of x (T of Mereni.T), else x (u when the series itself is x). */
export function parameterOf(x: FitSeries): string {
  if (x.column) return x.column;
  return x.expr === 'x' ? 'u' : 'x';
}

/** A name for the curve from the column of y (R_fit, R_spl), not one the sheet has. */
export function curveName(y: FitSeries, method: FitMethod, taken: ReadonlySet<string>): string {
  const base = (y.column ?? y.expr).replace(/[^\p{L}\p{N}]/gu, '') || 'y';
  const tag = APPROXIMATE.includes(method) ? 'fit' : method === 'lagrange' ? 'lag' : method === 'polyline' ? 'lin' : method === 'spline' ? 'spl' : 'pch';
  let name = `${base}_${tag}`;
  for (let n = 2; taken.has(name); n++) name = `${base}_${tag}${n}`;
  return name;
}

/** The lines the dialog writes: the curve, and its chart when asked for. */
export function fitLines(choice: FitChoice): string[] {
  const { x, y, method, name } = choice;
  const p = parameterOf(x);
  const steps = choice.steps && hasSteps(method) ? ', steps: true' : '';
  let curve: string;
  switch (method) {
    case 'line':
      curve = `${name} := fit(${y.expr}, x: ${x.expr}${steps})`;
      break;
    case 'poly':
      curve = `${name} := fit(${y.expr}, x: ${x.expr}, kind: "${choice.degree <= 1 ? 'linear' : `poly${choice.degree}`}"${steps})`;
      break;
    case 'exp':
    case 'power':
    case 'log':
      curve = `${name} := fit(${y.expr}, x: ${x.expr}, kind: "${method}")`;
      break;
    case 'lagrange':
      // The polynomial through every point: as many coefficients as points.
      curve = `${name} := polyfit(${x.expr}, ${y.expr}, ${Math.max(1, x.length - 1)})`;
      break;
    case 'polyline':
      curve = `${name}(${p}) := interp1(${x.expr}, ${y.expr}, ${p})`;
      break;
    case 'spline':
    case 'pchip':
      curve = `${name}(${p}) := ${method}(${x.expr}, ${y.expr}, ${p})`;
      break;
  }
  // The points and the curve over them: a fitted curve is called by position, whatever its own variable.
  const lines = [curve];
  if (choice.chart) lines.push(`plot(${y.expr}, ${name}(${p}), ${p}: ${x.expr})`);
  return lines;
}
