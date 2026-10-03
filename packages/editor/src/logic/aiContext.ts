/**
 * What the model gets to see of a sheet (docs/01-filozofie.md, ch. 9.2): the
 * calculation text, what the program found (errors, warnings, checks), the
 * computed results line by line, and the tables: their columns and source, the
 * rows (small tables whole, large ones in part) and which line read which row.
 * All in English, which costs fewer tokens; the overview of the language is
 * generated from the core, so it never goes stale.
 */
import { builtinFunctions, signature, type Cell, type SheetResult, type Table } from '@kalketa/core';
import { CATALOGS, formatDiagnostic } from '@kalketa/i18n';

export interface AiSheetContext {
  readonly title: string;
  readonly source: string;
  readonly findings: readonly string[];
}

/** Results are many; the model needs the gist, not every digit. */
const MAX_RESULTS = 400;
/** A table this small goes whole; a larger one by its first rows and the rows the sheet used. */
const WHOLE_TABLE_ROWS = 60;
const EXCERPT_ROWS = 20;

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(5)));
}

export function sheetContext(title: string, result: SheetResult): AiSheetContext {
  const en = CATALOGS['en']!;
  const lineOf = (statement: number) => result.statements[statement]?.statement.span.line;
  const diagnostics = result.diagnostics.map((d) => `line ${d.span.line}: ${d.severity} ${d.code}: ${formatDiagnostic(d, en)}`);
  const checks = result.checks.map((c) => {
    const utilization = c.utilization !== undefined ? `, utilization ${Math.round(c.utilization * 100)} %` : '';
    return `line ${lineOf(c.statement)}: check ${c.passed ? 'passed' : 'FAILED'}${c.label ? ` (${c.label})` : ''}${utilization}`;
  });
  const results = result.statements
    .filter((s) => s.display)
    .slice(0, MAX_RESULTS)
    .map((s) => `line ${s.statement.span.line} = ${number(s.display!.value)}${s.display!.im ? ` ${s.display!.im >= 0 ? '+' : '-'} ${number(Math.abs(s.display!.im))}j` : ''}${s.display!.unit ? ` ${s.display!.unit}` : ''}`);
  return {
    title,
    source: result.source,
    findings: [...diagnostics, ...checks, ...(results.length > 0 ? ['Computed results:', ...results] : []), ...tablesSeen(result)],
  };
}

/** A cell as written in the table: numbers in the column's unit. */
function cellText(cell: Cell, unit: { factor: number; offset?: number } | undefined): string {
  if (cell === null) return '';
  if (cell.type === 'quantity') return number(unit ? cell.si / unit.factor - (unit.offset ?? 0) : cell.si);
  if (cell.type === 'text' || cell.type === 'boolean') return String(cell.value);
  return '?';
}

function tablesSeen(result: SheetResult): string[] {
  // Rows each line read: "line 8 read Profily_IPE row 6".
  const used = new Map<string, Set<number>>();
  const reads: string[] = [];
  for (const s of result.statements) {
    for (const read of s.tableReads) {
      for (const row of read.rows) {
        if (!used.has(read.table)) used.set(read.table, new Set());
        used.get(read.table)!.add(row);
      }
      reads.push(`line ${s.statement.span.line} read ${read.table} row ${read.rows.map((r) => r + 1).join(' and ')}${read.column ? ` column ${read.column}` : ''}`);
    }
  }
  const tables = [...result.tables.values()].flatMap((table) => tableText(table, used.get(table.name) ?? new Set()));
  return tables.length > 0 ? ['Tables of the sheet (rows numbered from 1):', ...tables, ...[...new Set(reads)]] : [];
}

function tableText(table: Table, used: ReadonlySet<number>): string[] {
  const columns = table.columns.map((c) => (c.unit ? `${c.name} [${c.unit}]` : c.name));
  const source = table.source ? `; source: ${table.source.title}${table.source.note ? ` (${table.source.note})` : ''}` : '';
  const head = `Table ${table.name}, ${table.rows.length} rows, key ${table.key}${source}`;
  const whole = table.rows.length <= WHOLE_TABLE_ROWS;
  const shown = table.rows.map((row, i) => ({ row, i })).filter(({ i }) => whole || i < EXCERPT_ROWS || used.has(i));
  const lines = shown.map(({ row, i }) => `${i + 1}: ${row.map((cell, c) => cellText(cell, table.columns[c]?.resolvedUnit)).join(' | ')}`);
  return [head, `columns: ${columns.join(' | ')}`, ...lines, ...(whole ? [] : [`(${table.rows.length - shown.length} more rows not shown)`])];
}

/** Built-in functions as signatures, one line: enough for the model to write valid lines. */
export function languageGuide(): string {
  const functions = builtinFunctions
    .all()
    .map((def) => signature(def))
    .join(', ');
  return [
    'Definition: name := expression, with units (L := 6 m, q := 10 kN/m); a name must be defined above its use and only once.',
    '"a =" shows a result. "expr | kN·m" sets the unit it is shown in. "x² + 2·x == 8" is an equation for the solver.',
    'check "Bending": σ ≤ f_y  source "EN 1993-1-1, 6.2.5"  is a check (label and source optional); utilization = left / right.',
    '#, ##, ### are headings; \' starts a comment; a line in "quotes" is printed text.',
    `Built-in functions: ${functions}.`,
  ].join('\n');
}
