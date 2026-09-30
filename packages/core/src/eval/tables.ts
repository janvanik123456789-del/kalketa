/**
 * Table functions (docs/03-jazyk.md, ch. 8.2):
 *
 *   pick(T, "IPE 200")              row by key column
 *   pick(T, λ: 0.5)                 row by exact value in any column
 *   interpolate(T, λ: λ_rel)        row interpolated linearly on a numeric column
 *   find_min(T, by: G, where: …)    row with the smallest G that satisfies the condition
 *   find_max(T, by: …, where: …)
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

export const TABLE_FUNCTIONS: ReadonlySet<string> = new Set(['pick', 'interpolate', 'find_min', 'find_max']);

const EPSILON = 1e-12;

export function callTableFunction(call: CallExpr, ctx: EvalContext, evaluate: Evaluate): Value {
  const table = tableArgument(call, ctx, evaluate);
  const result =
    call.name === 'pick' ? pick(call, table, ctx, evaluate)
    : call.name === 'interpolate' ? interpolate(call, table, ctx, evaluate)
    : findExtreme(call, table, ctx, evaluate);
  if (result.type === 'row') record(ctx, result);
  return result;
}

/** row.column */
export function memberOf(object: Value, name: string, span: Span, objectSpan: Span, ctx: EvalContext): Value {
  if (object.type === 'record') return object.values.get(name) ?? fail('E-BLOCK-OUTPUT', span, { block: object.block, name });
  if (object.type === 'table') return fail('E-UNSUPPORTED', span, { feature: 'table-column' });
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

function interpolate(call: CallExpr, table: Table, ctx: EvalContext, evaluate: Evaluate): Value {
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
