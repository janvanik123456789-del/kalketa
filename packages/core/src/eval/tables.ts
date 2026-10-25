/**
 * Table functions (docs/03-jazyk.md, ch. 8.2):
 *
 *   pick(T, "IPE 200")              row by key column
 *   pick(T, λ: 0.5)                 row by exact value in any column
 *   interpolate(T, λ: λ_rel)        row interpolated linearly on a numeric column
 *   find_min(T, by: G, where: …)    row with the smallest G that satisfies the condition
 *   find_max(T, by: …, where: …)
 *   filter(T, where: …)             the rows that satisfy the condition, as a table
 *
 * Inside `where`, `r` is the row being tested (r.Wy). Rows whose condition
 * needs an empty cell are skipped with a warning.
 */

import { CalcError, diagnostic, fail, type Span } from '../diagnostics.js';
import type { Expr, NamedArg } from '../lang/ast.js';
import { columnIndex, rowLabel, type Cell, type Table } from '../tables/table.js';
import { sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { Quantity, RowValue, Value } from '../values/value.js';
import { asBoolean } from './coerce.js';
import type { EvalContext } from './evaluator.js';

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

/** Name of the row variable inside `where:` conditions. */
export const ROW_VARIABLE = 'r';

export const TABLE_FUNCTIONS: ReadonlySet<string> = new Set(['pick', 'interpolate', 'find_min', 'find_max', 'filter']);

/** compare(Varianty, M, σ): the sheet calculated for each variant, a table of the values named (graph/session.ts). */
export const COMPARE_FUNCTION = 'compare';

const EPSILON = 1e-12;

export function callTableFunction(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const table = tableArgument(call, ctx, evaluate);
  const result =
    call.name === 'pick' ? pick(call, table, ctx, evaluate)
    : call.name === 'interpolate' ? interpolate(call, table, ctx, evaluate)
    : call.name === 'filter' ? filterRows(call, table, ctx, evaluate)
    : findExtreme(call, table, ctx, evaluate);
  if (result.type === 'row') record(ctx, result);
  return result;
}

/** row.column */
export function memberOf(object: Value, name: string, span: Span, objectSpan: Span, ctx: EvalContext): Value {
  if (object.type === 'record') return object.values.get(name) ?? fail('E-BLOCK-OUTPUT', span, { block: object.block, name });
  if (object.type === 'table') return columnOf(object.table, name, span);
  if (object.type !== 'row') return fail('E-TYPE', objectSpan, { expected: 'row', found: object.type });
  const index = columnIndex(object.table, name);
  if (index === -1) fail('E-TABLE-COLUMN', span, { table: object.table.name, column: name });
  record(ctx, object, name);
  const cell = object.cells[index];
  if (!cell) fail('E-TABLE-EMPTY', span, { table: object.table.name, column: name, row: object.label });
  return cell;
}

// ---------------------------------------------------------------------------

function pick(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
  let column: string;
  let wanted: Value;
  let span: Span;
  if (call.named.length === 0 && call.args.length === 2) {
    column = table.key;
    wanted = evaluate(call.args[1]!, ctx);
    span = call.args[1]!.span;
  } else if (call.named.length === 1 && call.args.length === 1) {
    const arg = call.named[0]!;
    column = arg.name;
    wanted = evaluate(arg.value, ctx);
    span = arg.value.span;
  } else {
    return fail('E-FUNC-ARITY', call.span, { function: 'pick', expected: 2, found: call.args.length + call.named.length });
  }
  const index = requireColumn(table, column, call.named[0]?.nameSpan ?? call.span);
  const row = table.rows.findIndex((cells) => cellEquals(cells[index] ?? null, wanted));
  if (row === -1) fail('E-TABLE-KEY', span, { table: table.name, column, key: describe(wanted) });
  return rowValue(table, row);
}

/** A numeric column of a table as a series: Vyroba.E. */
function columnOf(table: Table, name: string, span: Span): Value {
  const index = requireColumn(table, name, span);
  if (table.columns[index]!.type !== 'quantity') fail('E-TABLE-INTERPOLATE', span, { table: table.name, column: name, problem: 'not-numeric' });
  const items = table.rows.map((cells, row) => {
    const cell = cells[index] ?? null;
    if (cell?.type !== 'quantity') return fail('E-TABLE-EMPTY', span, { table: table.name, column: name, row: rowLabel(table, row) });
    return cell;
  });
  return { type: 'vector', items };
}

function interpolate(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
  if (call.args.length === 1 && call.named.length === 2) return interpolate2(call, table, ctx, evaluate);
  if (call.args.length !== 1 || call.named.length !== 1) {
    return fail('E-FUNC-ARITY', call.span, { function: 'interpolate', expected: 2, found: call.args.length + call.named.length });
  }
  const arg = call.named[0]!;
  const index = requireColumn(table, arg.name, arg.nameSpan);
  const column = table.columns[index]!;
  if (column.type !== 'quantity') fail('E-TABLE-INTERPOLATE', arg.nameSpan, { table: table.name, column: arg.name, problem: 'not-numeric' });

  const x = evaluate(arg.value, ctx);
  if (x.type !== 'quantity') return fail('E-TYPE', arg.value.span, { expected: 'number', found: x.type });

  const points = table.rows
    .map((cells, row) => ({ row, cell: cells[index] ?? null }))
    .filter((p): p is { row: number; cell: Quantity } => p.cell?.type === 'quantity')
    .sort((a, b) => a.cell.si - b.cell.si);
  if (points.length < 2) fail('E-TABLE-INTERPOLATE', arg.nameSpan, { table: table.name, column: arg.name, problem: 'too-few-rows' });
  if (!sameDim(points[0]!.cell.dim, x.dim)) {
    fail('E-UNIT-MISMATCH', arg.value.span, { operator: 'interpolate', left: baseUnitSymbol(points[0]!.cell.dim), right: baseUnitSymbol(x.dim) });
  }

  const exact = points.find((p) => near(p.cell.si, x.si));
  if (exact) return rowValue(table, exact.row);

  let i = points.findIndex((p) => p.cell.si > x.si) - 1;
  if (i === -2) i = points.length - 2; // above the last row
  if (i === -1) i = 0; // below the first row
  const a = points[i]!;
  const b = points[i + 1]!;
  if (near(a.cell.si, b.cell.si)) fail('E-TABLE-INTERPOLATE', arg.nameSpan, { table: table.name, column: arg.name, problem: 'duplicate-x' });
  const t = (x.si - a.cell.si) / (b.cell.si - a.cell.si);
  if (t < 0 || t > 1) ctx.warnings.push(diagnostic('W-EXTRAPOLATION', arg.value.span, { table: table.name, column: arg.name }));

  const rowA = table.rows[a.row]!;
  const rowB = table.rows[b.row]!;
  const cells = table.columns.map((_, c) => (c === index ? x : blend(rowA[c] ?? null, rowB[c] ?? null, t)));
  return {
    type: 'row',
    table,
    cells,
    label: `${rowLabel(table, a.row)} – ${rowLabel(table, b.row)}`,
    origin: { rows: [a.row, b.row], weight: t, column: arg.name },
  };
}

/**
 * interpolate(T, θ: 35 °C, n: 4): bilinear interpolation over a grid of
 * rows, one row per point (θ, n, k …). The four points around the query must
 * be in the table; outside the grid it extrapolates with a warning.
 */
function interpolate2(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
  const axes = call.named.map((arg) => {
    const index = requireColumn(table, arg.name, arg.nameSpan);
    if (table.columns[index]!.type !== 'quantity') fail('E-TABLE-INTERPOLATE', arg.nameSpan, { table: table.name, column: arg.name, problem: 'not-numeric' });
    const x = evaluate(arg.value, ctx);
    if (x.type !== 'quantity') return fail('E-TYPE', arg.value.span, { expected: 'number', found: x.type });
    return { arg, index, x };
  }) as [Axis, Axis];

  // Rows with both coordinates; the distinct values of each axis.
  const points = table.rows.flatMap((cells, row) => {
    const a = cells[axes[0].index] ?? null;
    const b = cells[axes[1].index] ?? null;
    return a?.type === 'quantity' && b?.type === 'quantity' ? [{ row, a: a.si, b: b.si }] : [];
  });
  const brackets = axes.map((axis, k) => {
    const first = table.rows.find((cells) => cells[axis.index]?.type === 'quantity')?.[axis.index] as Quantity | undefined;
    if (first && !sameDim(first.dim, axis.x.dim)) {
      fail('E-UNIT-MISMATCH', axis.arg.value.span, { operator: 'interpolate', left: baseUnitSymbol(first.dim), right: baseUnitSymbol(axis.x.dim) });
    }
    const values = [...new Set(points.map((p) => (k === 0 ? p.a : p.b)))].sort((x, y) => x - y);
    if (values.length < 2) fail('E-TABLE-INTERPOLATE', axis.arg.nameSpan, { table: table.name, column: axis.arg.name, problem: 'too-few-rows' });
    return bracket(values, axis.x.si);
  }) as [Bracket, Bracket];
  axes.forEach((axis, k) => {
    const t = brackets[k]!.t;
    if (t < 0 || t > 1) ctx.warnings.push(diagnostic('W-EXTRAPOLATION', axis.arg.value.span, { table: table.name, column: axis.arg.name }));
  });

  // The four corners around the query.
  const corner = (a: number, b: number): number => {
    const found = points.find((p) => near(p.a, a) && near(p.b, b));
    if (!found) fail('E-TABLE-INTERPOLATE', call.span, { table: table.name, column: `${axes[0].arg.name}, ${axes[1].arg.name}`, problem: 'grid' });
    return found!.row;
  };
  const [x, y] = brackets;
  const r00 = corner(x.low, y.low);
  const r10 = corner(x.high, y.low);
  const r01 = corner(x.low, y.high);
  const r11 = corner(x.high, y.high);
  const cell = (row: number, c: number) => table.rows[row]![c] ?? null;
  const cells = table.columns.map((_, c) => {
    if (c === axes[0].index) return axes[0].x;
    if (c === axes[1].index) return axes[1].x;
    return blend(blend(cell(r00, c), cell(r10, c), x.t), blend(cell(r01, c), cell(r11, c), x.t), y.t);
  });
  return {
    type: 'row',
    table,
    cells,
    label: `${rowLabel(table, r00)} – ${rowLabel(table, r11)}`,
    origin: { rows: [...new Set([r00, r10, r01, r11])], weight: x.t, column: axes[0].arg.name, weight2: y.t, column2: axes[1].arg.name },
  };
}

interface Axis {
  readonly arg: NamedArg;
  readonly index: number;
  readonly x: Quantity;
}

interface Bracket {
  readonly low: number;
  readonly high: number;
  /** Position of the query between low and high (outside 0..1 when extrapolated). */
  readonly t: number;
}

/** The neighbouring grid values around x; an exact hit has t = 0. */
function bracket(values: readonly number[], x: number): Bracket {
  const exact = values.find((v) => near(v, x));
  if (exact !== undefined) return { low: exact, high: exact, t: 0 };
  let i = values.findIndex((v) => v > x) - 1;
  if (i === -2) i = values.length - 2;
  if (i === -1) i = 0;
  const low = values[i]!;
  const high = values[i + 1]!;
  return { low, high, t: (x - low) / (high - low) };
}

function findExtreme(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
  const byArg = namedArg(call, 'by');
  const whereArg = namedArg(call, 'where');
  for (const n of call.named) {
    if (n.name !== 'by' && n.name !== 'where') fail('E-NAMED-ARG', n.nameSpan, { function: call.name, argument: n.name, problem: 'unknown' });
  }
  if (!byArg) return fail('E-NAMED-ARG', call.span, { function: call.name, argument: 'by', problem: 'missing' });
  if (call.args.length !== 1) return fail('E-FUNC-ARITY', call.span, { function: call.name, expected: 1, found: call.args.length });
  if (byArg.value.kind !== 'variable' && byArg.value.kind !== 'unit') {
    return fail('E-SYNTAX', byArg.value.span, { expected: 'member-name', found: '' });
  }
  const byName = byArg.value.kind === 'variable' ? byArg.value.name : unitName(byArg.value);
  const byIndex = requireColumn(table, byName, byArg.value.span);

  let best: { row: number; si: number } | undefined;
  let skipped = 0;
  table.rows.forEach((cells, row) => {
    const by = cells[byIndex] ?? null;
    if (by?.type !== 'quantity') {
      skipped++;
      return;
    }
    const match = whereArg ? rowMatches(whereArg, rowValue(table, row), ctx, evaluate) : 'yes';
    if (match !== 'yes') {
      if (match === 'skipped') skipped++;
      return;
    }
    const better = !best || (call.name === 'find_min' ? by.si < best.si : by.si > best.si);
    if (better) best = { row, si: by.si };
  });

  if (skipped > 0) ctx.warnings.push(diagnostic('W-TABLE-ROWS-SKIPPED', call.span, { table: table.name, count: skipped }));
  if (!best) return fail('E-TABLE-NO-MATCH', call.span, { table: table.name });
  return rowValue(table, best.row);
}

/**
 * The rows that satisfy `where`, as a table of their own: its columns are series
 * (filter(T, where: r.W_y >= 300 cm³).G), and pick, find_min and the others read it.
 * None may satisfy it: an empty table, which a function reading a row reports.
 */
function filterRows(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
  const whereArg = namedArg(call, 'where');
  for (const n of call.named) {
    if (n.name !== 'where') fail('E-NAMED-ARG', n.nameSpan, { function: call.name, argument: n.name, problem: 'unknown' });
  }
  if (!whereArg) return fail('E-NAMED-ARG', call.span, { function: call.name, argument: 'where', problem: 'missing' });
  if (call.args.length !== 1) return fail('E-FUNC-ARITY', call.span, { function: call.name, expected: 1, found: call.args.length });
  let skipped = 0;
  const kept = table.rows.filter((_, row) => {
    const match = rowMatches(whereArg, rowValue(table, row), ctx, evaluate);
    if (match === 'skipped') skipped++;
    return match === 'yes';
  });
  if (skipped > 0) ctx.warnings.push(diagnostic('W-TABLE-ROWS-SKIPPED', call.span, { table: table.name, count: skipped }));
  const { totals: _totals, ...rest } = table;
  return { type: 'table', table: { ...rest, rows: kept, fingerprint: `${table.fingerprint}:${kept.map((r) => table.rows.indexOf(r)).join(',')}` } };
}

/** Evaluates `where` for one row; rows with empty cells count as skipped. */
function rowMatches(where: NamedArg, row: RowValue, ctx: EvalContext, evaluate: Evaluate): 'yes' | 'no' | 'skipped' {
  // Reads of the candidate rows are not provenance of the result; only the chosen row is.
  const { tableReads: _ignored, ...outer } = ctx;
  const rowCtx: EvalContext = {
    ...outer,
    lookup: (name, span) => (name === ROW_VARIABLE ? row : ctx.lookup(name, span)),
  };
  try {
    return asBoolean(evaluate(where.value, rowCtx), where.value.span) ? 'yes' : 'no';
  } catch (err) {
    if (err instanceof CalcError && err.diagnostic.code === 'E-TABLE-EMPTY') {
      return 'skipped';
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------

function tableArgument(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Table {
  const first = call.args[0];
  if (!first) return fail('E-FUNC-ARITY', call.span, { function: call.name, expected: 2, found: 0 });
  const value = evaluate(first, ctx);
  if (value.type !== 'table') return fail('E-TYPE', first.span, { expected: 'table', found: value.type === 'quantity' ? 'number' : value.type });
  return value.table;
}

function requireColumn(table: Table, name: string, span: Span): number {
  const index = columnIndex(table, name);
  if (index === -1) fail('E-TABLE-COLUMN', span, { table: table.name, column: name });
  return index;
}

function namedArg(call: CallExpr, name: string): NamedArg | undefined {
  return call.named.find((n) => n.name === name);
}

function unitName(expr: Extract<Expr, { kind: 'unit' }>): string {
  return expr.unit.kind === 'unit-name' ? expr.unit.name : '';
}

function record(ctx: EvalContext, row: RowValue, column?: string): void {
  if (!ctx.tableReads) return;
  const { rows, weight } = row.origin;
  const read = {
    table: row.table.name,
    rows,
    ...(column !== undefined ? { column } : {}),
    ...(weight !== undefined ? { weight } : {}),
  };
  const same = (r: typeof read) => r.table === read.table && r.column === read.column && r.rows.join() === read.rows.join();
  if (!ctx.tableReads.some(same)) ctx.tableReads.push(read);
}

function rowValue(table: Table, row: number): RowValue {
  return { type: 'row', table, cells: table.rows[row]!, label: rowLabel(table, row), origin: { rows: [row] } };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

function cellEquals(cell: Cell, wanted: Value): boolean {
  if (!cell || cell.type !== wanted.type) return false;
  if (cell.type === 'quantity' && wanted.type === 'quantity') return sameDim(cell.dim, wanted.dim) && near(cell.si, wanted.si);
  if (cell.type === 'text' && wanted.type === 'text') return cell.value === wanted.value;
  if (cell.type === 'boolean' && wanted.type === 'boolean') return cell.value === wanted.value;
  return false;
}

/** Linear blend of two cells; non-numeric cells survive only if equal. */
function blend(a: Cell, b: Cell, t: number): Cell {
  if (!a || !b) return null;
  if (a.type === 'quantity' && b.type === 'quantity' && sameDim(a.dim, b.dim)) {
    return { ...a, si: a.si + (b.si - a.si) * t };
  }
  return cellEquals(a, b) ? a : null;
}

function describe(value: Value): string {
  switch (value.type) {
    case 'text':
      return value.value;
    case 'quantity':
      return String(value.si);
    case 'boolean':
      return String(value.value);
    default:
      return value.type;
  }
}
