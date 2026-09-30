/**
 * Provenance: traces a result back to formulas, inputs, table rows and their
 * sources (docs/01-filozofie.md, principle 4).
 *
 *   σ = M_Ed / profil.W_y
 *   ├── M_Ed = q·L²/8
 *   │   ├── q = 12 kN/m
 *   │   └── L = 5 m
 *   └── profil = pick(Profily_IPE, "IPE 200")
 *       └── table Profily_IPE, row "IPE 200", column W_y — source: catalogue …
 */

import type { SheetResult, StatementResult } from '../graph/session.js';
import { rowLabel, type TableRead, type TableSource } from '../tables/table.js';
import { toDisplay, type DisplayValue } from '../units/display.js';
import { defaultRegistry } from '../units/registry.js';
import type { Value } from '../values/value.js';

export interface TraceTableRef extends TableRead {
  /** Key of each row read, e.g. ["IPE 200"]. */
  readonly rowLabels: readonly string[];
  readonly source?: TableSource;
}

export interface TraceNode {
  readonly kind: 'variable' | 'table' | 'imported' | 'unknown';
  /** For values taken from another layer: that layer. */
  readonly layer?: { readonly id: string; readonly name: string };
  readonly name: string;
  /** Index into SheetResult.statements. */
  readonly statement?: number;
  readonly line?: number;
  /** Formula as written, e.g. "q·L²/8". */
  readonly expression?: string;
  readonly comment?: string;
  readonly value?: Value;
  readonly display?: DisplayValue;
  readonly inputs: readonly TraceNode[];
  /** Table data read directly by this formula. */
  readonly tables: readonly TraceTableRef[];
}

/** Traces a defined name. Returns undefined when nothing of that name exists. */
export function traceName(result: SheetResult, name: string, depth = 32): TraceNode | undefined {
  const index = result.statements.findIndex((r) => r.statement.kind === 'definition' && r.statement.name === name);
  if (index !== -1) return traceStatement(result, index, depth);
  const imported = result.imports.get(name);
  if (imported) {
    const display = imported.value.type === 'quantity' ? toDisplay(imported.value, defaultRegistry) : undefined;
    return {
      kind: 'imported',
      name,
      value: imported.value,
      ...(display ? { display } : {}),
      layer: { id: imported.layer, name: imported.layerName },
      inputs: [],
      tables: [],
    };
  }
  const table = result.tables.get(name);
  if (table) {
    return {
      kind: 'table',
      name,
      value: { type: 'table', table },
      inputs: [],
      tables: [{ table: name, rows: [], rowLabels: [], ...(table.source ? { source: table.source } : {}) }],
    };
  }
  return undefined;
}

/** Traces one statement (a definition, display or check). */
export function traceStatement(result: SheetResult, index: number, depth = 32): TraceNode {
  const r: StatementResult = result.statements[index]!;
  const s = r.statement;
  const name = s.kind === 'definition' ? s.name : s.kind === 'check' ? (s.label ?? '') : '';
  const expr = s.kind === 'definition' || s.kind === 'display' || s.kind === 'check' ? s.expr : undefined;

  const inputs =
    depth <= 0
      ? []
      : r.dependencies.map((dep) => traceName(result, dep, depth - 1) ?? { kind: 'unknown' as const, name: dep, inputs: [], tables: [] });

  return {
    kind: 'variable',
    name,
    statement: index,
    line: s.span.line,
    ...(expr ? { expression: result.source.slice(expr.span.offset, expr.span.offset + expr.span.length) } : {}),
    ...(s.comment !== undefined ? { comment: s.comment } : {}),
    ...(r.value ? { value: r.value } : {}),
    ...(r.display ? { display: r.display } : {}),
    // Whole tables are listed as table reads, not repeated as inputs.
    inputs: inputs.filter((n) => n.kind !== 'table'),
    tables: r.tableReads.map((read) => tableRef(result, read)),
  };
}

function tableRef(result: SheetResult, read: TableRead): TraceTableRef {
  const table = result.tables.get(read.table);
  return {
    ...read,
    rowLabels: table ? read.rows.map((row) => rowLabel(table, row)) : [],
    ...(table?.source ? { source: table.source } : {}),
  };
}

/** Every table row and source a result ultimately depends on, deduplicated. */
export function sourcesOf(node: TraceNode): TraceTableRef[] {
  const out: TraceTableRef[] = [];
  const visit = (n: TraceNode): void => {
    for (const ref of n.tables) {
      const key = `${ref.table}|${ref.rows.join()}|${ref.column ?? ''}`;
      if (!out.some((o) => `${o.table}|${o.rows.join()}|${o.column ?? ''}` === key)) out.push(ref);
    }
    n.inputs.forEach(visit);
  };
  visit(node);
  return out;
}
