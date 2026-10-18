/**
 * Insert > Fit a curve…: what the dialog offers and the lines it writes.
 * The lines are ordinary lines of the sheet (fit, polyfit, interp1, spline, pchip and a plot),
 * so the user can go on editing them by hand.
 */

import type { Expr, SheetResult, Statement, Value } from '@kalketa/core';

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

// ---------------------------------------------------------------------------
// Where the lines go: after the current line with a chart of their own, into a chart the
// sheet has, or in place of the curve being edited. The same edits make the preview and the sheet.

/** A chart of the sheet a curve can join: plot(…, x: …) on one line. */
export interface FitChart {
  /** Its line, counted from 1. */
  readonly line: number;
  /** Its title, else the text of its line. */
  readonly label: string;
  /** The variable it runs over (x of x: Body.x): the new curve is called with it. */
  readonly binder: string;
  /** Where in the line a curve goes: after its last curve. */
  readonly at: number;
  readonly text: string;
}

/** Lines replaced or put in: from line `start` (counted from 1), `removed` lines give way to `lines`. */
export interface LineEdit {
  readonly start: number;
  readonly removed: number;
  readonly lines: readonly string[];
}

export type FitTarget =
  /** After line `after`, with a chart of its own when asked. */
  | { readonly kind: 'new'; readonly after: number }
  /** Before a chart of the sheet, the curve added to it. */
  | { readonly kind: 'chart'; readonly chart: FitChart }
  /** In place of the curve on lines start … end (editing it). */
  | { readonly kind: 'replace'; readonly start: number; readonly end: number };

const textOf = (source: string, e: { readonly span: { readonly offset: number; readonly length: number } }) => source.slice(e.span.offset, e.span.offset + e.span.length).trim();

/** The charts of the sheet a curve can join, in sheet order. */
export function fitCharts(result: SheetResult): FitChart[] {
  const source = result.source;
  const lines = source.split('\n');
  const starts: number[] = [];
  lines.reduce((at, line) => (starts.push(at), at + line.length + 1), 0);
  return result.statements.flatMap(({ statement: s }): FitChart[] => {
    if (s.kind !== 'display' || s.expr.kind !== 'call' || s.expr.name !== 'plot') return [];
    const call = s.expr;
    const binder = call.named[0];
    const last = call.args[call.args.length - 1];
    const line = s.span.line;
    const text = lines[line - 1];
    const start = starts[line - 1];
    // One line only (a chart written over more lines is left to the hand).
    if (!binder || !last || text === undefined || start === undefined || s.span.offset + s.span.length > start + text.length) return [];
    const title = call.named.find((n) => n.name === 'title')?.value;
    const label = title?.kind === 'string' ? title.value : text.trim().length > 60 ? `${text.trim().slice(0, 57)}…` : text.trim();
    return [{ line, label, binder: binder.name, at: last.span.offset + last.span.length - start, text }];
  });
}

/** The edits that write a curve where it goes. */
export function fitEdits(choice: FitChoice, target: FitTarget): LineEdit[] {
  const lines = fitLines({ ...choice, chart: target.kind === 'new' && choice.chart });
  switch (target.kind) {
    case 'new':
      return [{ start: target.after + 1, removed: 0, lines }];
    case 'chart': {
      const { chart } = target;
      const joined = `${chart.text.slice(0, chart.at)}, ${choice.name}(${chart.binder})${chart.text.slice(chart.at)}`;
      return [{ start: chart.line, removed: 1, lines: [lines[0]!, joined] }];
    }
    case 'replace':
      return [{ start: target.start, removed: target.end - target.start + 1, lines: [lines[0]!] }];
  }
}

/** The text with the edits made, and the lines they wrote (counted from 1, in the new text). */
export function applyEdits(text: string, edits: readonly LineEdit[]): { text: string; touched: number[] } {
  const out = text.split('\n');
  const touched: number[] = [];
  let shift = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    const at = Math.min(edit.start - 1 + shift, out.length);
    out.splice(at, edit.removed, ...edit.lines);
    edit.lines.forEach((_, i) => touched.push(at + 1 + i));
    shift += edit.lines.length - edit.removed;
  }
  return { text: out.join('\n'), touched };
}

/**
 * A curve of the sheet as the dialog would have written it (fit, polyfit, interp1, spline, pchip
 * over series it offers), with its lines; undefined for anything else (it is edited by hand).
 */
export function readFit(statement: Statement, source: string, series: readonly FitSeries[]): { choice: FitChoice; start: number; end: number } | undefined {
  if (statement.kind !== 'definition' || statement.expr.kind !== 'call') return undefined;
  const call = statement.expr;
  const find = (e: Expr | undefined) => (e ? series.find((s) => s.expr === textOf(source, e)) : undefined);
  const named = (name: string) => call.named.find((n) => n.name === name)?.value;
  const start = statement.span.line;
  const end = start + (source.slice(statement.span.offset, statement.span.offset + statement.span.length).match(/\n/g)?.length ?? 0);
  const base = { name: statement.name, steps: false, chart: false, degree: 2 };
  const done = (x: FitSeries | undefined, y: FitSeries | undefined, rest: Pick<FitChoice, 'method'> & Partial<FitChoice>) => (x && y ? { choice: { ...base, x, y, ...rest }, start, end } : undefined);
  const params = statement.params ?? [];
  switch (call.name) {
    case 'fit': {
      if (params.length > 0 || call.args.length !== 1) return undefined;
      const kind = named('kind');
      const name = kind === undefined ? 'linear' : kind.kind === 'string' ? kind.value : '';
      const steps = named('steps');
      const degree = Number(/^poly(\d+)$/.exec(name)?.[1]);
      const method: FitMethod | undefined = name === 'linear' ? 'line' : degree >= 2 ? 'poly' : name === 'exp' || name === 'power' || name === 'log' ? name : undefined;
      return method ? done(find(named('x')), find(call.args[0]), { method, steps: steps?.kind === 'boolean' && steps.value, ...(method === 'poly' ? { degree } : {}) }) : undefined;
    }
    case 'polyfit': {
      const n = call.args[2];
      if (params.length > 0 || call.args.length !== 3 || n?.kind !== 'number' || n.unit) return undefined;
      const [x, y] = [find(call.args[0]), find(call.args[1])];
      const method: FitMethod = x && n.value === x.length - 1 ? 'lagrange' : n.value === 1 ? 'line' : 'poly';
      return done(x, y, { method, ...(method === 'poly' ? { degree: n.value } : {}) });
    }
    case 'interp1':
    case 'spline':
    case 'pchip': {
      const at = call.args[2];
      if (params.length !== 1 || at?.kind !== 'variable' || at.name !== params[0]!.name) return undefined;
      const way = call.name === 'interp1' ? call.args[3] : undefined;
      if (call.args.length > (call.name === 'interp1' ? 4 : 3) || (way && way.kind !== 'string')) return undefined;
      const text = way?.kind === 'string' ? way.value : call.name === 'interp1' ? 'linear' : call.name;
      const method: FitMethod | undefined = text === 'linear' ? 'polyline' : text === 'spline' || text === 'pchip' ? text : undefined;
      return method ? done(find(call.args[0]), find(call.args[1]), { method }) : undefined;
    }
    default:
      return undefined;
  }
}
