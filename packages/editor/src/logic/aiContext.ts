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
  /** Sections of the sources layers, cited as [T3]. */
  readonly theory?: readonly { readonly id?: string; readonly title: string; readonly text: string }[];
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

/**
 * A row by its key ("IPE 200"), not by a number: numbers of table rows and of
 * calculation lines are easily mixed up.
 */
function rowName(table: Table | undefined, row: number): string {
  const key = table ? table.columns.findIndex((c) => c.name === table.key) : -1;
  const cell = table?.rows[row]?.[key];
  return cell && cell.type === 'text' ? `"${cell.value}"` : `row #${row + 1}`;
}

function tablesSeen(result: SheetResult): string[] {
  // Rows each line read: 'line 8 read Profily_IPE "IPE 200"'.
  const used = new Map<string, Set<number>>();
  const reads: string[] = [];
  for (const s of result.statements) {
    for (const read of s.tableReads) {
      for (const row of read.rows) {
        if (!used.has(read.table)) used.set(read.table, new Set());
        used.get(read.table)!.add(row);
      }
      const table = result.tables.get(read.table);
      const rows = read.rows.map((r) => rowName(table, r)).join(read.weight !== undefined ? ' and (interpolated) ' : ' and ');
      reads.push(`line ${s.statement.span.line} read ${read.table} ${rows}${read.column ? ` column ${read.column}` : ''}`);
    }
  }
  const tables = [...result.tables.values()].flatMap((table) => tableText(table, used.get(table.name) ?? new Set()));
  return tables.length > 0 ? ['Tables of the sheet (a row is named by its key, never by a line number):', ...tables, ...[...new Set(reads)]] : [];
}

function tableText(table: Table, used: ReadonlySet<number>): string[] {
  const columns = table.columns.map((c) => (c.unit ? `${c.name} [${c.unit}]` : c.name));
  const source = table.source ? `; source: ${table.source.title}${table.source.note ? ` (${table.source.note})` : ''}` : '';
  const head = `Table ${table.name}, ${table.rows.length} rows, key ${table.key}${source}`;
  const whole = table.rows.length <= WHOLE_TABLE_ROWS;
  const shown = table.rows.map((row, i) => ({ row, i })).filter(({ i }) => whole || i < EXCERPT_ROWS || used.has(i));
  const lines = shown.map(({ row }) => row.map((cell, c) => cellText(cell, table.columns[c]?.resolvedUnit)).join(' | '));
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
    'solve L: M_Ed == q·L²/8 expresses one unknown by a formula where it can (L = √(8·M_Ed/q), with its unit) and else solves numerically ("in a .. b" interval or "guess"); of more roots the interval picks. An inequality works too: solve d: S_min ≤ π·d²/4 gives d ≥ √(4·S_min/π) (d takes the bound).',
    'check "Bending": σ ≤ f_y  source "EN 1993-1-1, 6.2.5"  is a check (label and source optional); utilization = left / right.',
    'A derivation as in a textbook: y := M/(E·I) == F·l^3/(3·E·I) (the last member gives y), or "derive a == b == c" on its own; the program checks every step in general, so write each step as an equal form. "derive M_mp := l^3·F/3" introduces a symbol of theory without values. sum(ΔS·y^2), sum(F_i·a_i, i) and integral(y^2, dS) without bounds are notations of theory (Σ, ∫) with no value.',
    'A table in the sheet (measured data): a line "table Name:" and indented rows "| col [unit] | … |", the first row the header; Name.col is a series. fit(Name.y, x: Name.t, kind: "linear"|"poly2"|"poly3"|"exp"|"power"|"log") gives a fitted function f(t); plot(Name.y, f(x), x: Name.t) shows points and the curve.',
    'Text: a printed paragraph is a whole line in straight double quotes ("Volíme průměr nýtu 6 mm."); no quote mark inside, no formula after it, only its sources may follow: "…" [T1] or [ST:T1]. Names with an index or a power inside text (σ_Kt, S_min, mm^2) print as in formulas. A vector has the arrow U+20D7 right after its letter: p⃗_1, v⃗ (an arrow over p with its index, as in physics books). A note beside a formula is a comment after \' on the same line. #, ##, ### are headings.',
    'How a result is shown: {decimals=2} or {digits=3} at the end of its line (before a comment); the calculation stays exact, unless the line adds rounded ({decimals=2 rounded}): the rows below then use the value as shown. {eq=name} numbers an equation at the right and text refers to it as (#name). A text line or heading may end with its style: {size=12 italic bold font=serif align=center color=blue}; inside text *italic* and **bold** words. "expr | kN·m" sets its unit.',
    'Names as in the source: Greek letters and indexes (σ_k, τ_dov, R_m), never spelled out (sigma_k); multiply with · (not *).',
    'Positions (a structural calculation split by members: Pos. 1 slab, Pos. 2 beam): a heading ending in {pos} starts one, numbered 1, 2, 3 ({pos=7} or {pos=3a} as the project numbers it). The names defined in a position hold until the next one starts, so each position may use A, L, M_Ed again; a later position reads them as Pos1.A (a reaction of Pos. 1 as a load of Pos. 2). Names above the first position (materials, factors) hold everywhere. Use positions when the task has several members; do not repeat names across positions by suffixes (A_1, A_2) then.',
    'A table row: row := pick(Table, "key") (or pick(Table, column: value)); a value of it: row.column, or at once pick(Table, "key").column. A row is no number: pick(…) | mm is wrong, pick(…).d | mm is right.',
    `Built-in functions: ${functions}.`,
    'Sample fragments of a sheet (write in this form):',
    ...SHEET_FRAGMENTS.map((f) => `--- ${f.topic}\n${f.source}`),
  ].join('\n');
}

/**
 * Short pieces of a sheet, one thing each, that the guide shows the model so it
 * writes in the form at once instead of guessing (tests check each one runs clean).
 */
export const SHEET_FRAGMENTS: readonly { readonly topic: string; readonly source: string }[] = [
  {
    topic: 'headings, text and comments',
    source: ['# Výpočet průměru nýtu', '## Zadání', '"Nýt je namáhán smykem v jednom střihu."', "F := 1600 N            ' zatěžující síla", 'n := 1.5', '"Mez kluzu v tahu je přibližně polovina meze pevnosti." [T1]', 'R_m := 340 MPa', 'σ_k := R_m/2'].join('\n'),
  },
  {
    topic: 'a value read from a table',
    source: [
      'table Nyty:',
      '    | oznaceni | d [mm] |',
      '    | N6 | 6 |',
      '    | N8 | 8 |',
      'nyt := pick(Nyty, "N8")',
      'd_vol := nyt.d | mm',
      'd_6 := pick(Nyty, "N6").d',
    ].join('\n'),
  },
  {
    topic: 'definitions, a result shown, the unit of a result',
    source: ['L := 6 m', 'q := 10 kN/m', 'M_Ed := q·L²/8 | kN·m', 'M_Ed ='].join('\n'),
  },
  {
    topic: 'an inequality solved for the unknown, then the chosen value',
    source: ['F := 1600 N', 'τ_dov := 68 MPa', 'S_min := F/τ_dov | mm²', '"Průřez nýtu je kruh, odkud pro průměr platí:"', 'solve d: S_min ≤ π·d²/4', '"Volíme průměr nýtu 6 mm."', 'd_n := 6 mm'].join('\n'),
  },
  {
    topic: 'positions: each member its own names, a reaction passed on as a load',
    source: [
      'γ_G := 1.35',
      '## Stropní deska {pos}',
      'g := 5 kN/m',
      'L := 4 m',
      'A := γ_G·g·L/2',
      '## Průvlak {pos}',
      "F := Pos1.A            ' reakce stropní desky",
      'L := 6 m',
      'M_Ed := F·L/4',
      'A := F/2',
    ].join('\n'),
  },
  {
    topic: 'an equation solved in an interval',
    source: 'solve x: x² + 2·x == 8 in 0 .. 10',
  },
  {
    topic: 'a check with its source',
    source: ['σ := 150 MPa', 'f_y := 235 MPa', 'check "Ohyb": σ ≤ f_y  source "EN 1993-1-1, 6.2.5"'].join('\n'),
  },
  {
    topic: 'a derivation checked step by step',
    source: ['F := 2 kN', 'l := 1.5 m', 'E := 210 GPa', 'I := 800 cm⁴', 'M := F·l', 'φ := M·l/(2·E·I) == F·l²/(2·E·I)'].join('\n'),
  },
  {
    topic: 'measured points, a fitted curve and its chart',
    source: [
      'table Mereni:',
      '    | t [s] | T [°C] |',
      '    | 0 | 20.1 |',
      '    | 10 | 25.3 |',
      '    | 20 | 29.8 |',
      '    | 30 | 33.9 |',
      'T_fit := fit(Mereni.T, x: Mereni.t, kind: "linear")',
      'plot(Mereni.T, T_fit(x), x: Mereni.t)',
    ].join('\n'),
  },
];
