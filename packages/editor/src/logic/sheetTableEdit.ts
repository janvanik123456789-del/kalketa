/**
 * A table written in the sheet (docs/03-jazyk.md, ch. 8.4), as cells for the grid
 * that edits it and back as text:
 *
 *   table Mereni:
 *       | t [s] | T [°C] {0.0} |
 *       | 0     | 20.1         |
 *
 * Row 0 is the header (name [unit] {format}). The text it writes has its
 * columns padded to one width, so it stays readable as text too.
 */

export interface SheetTableCells {
  readonly name: string;
  /** The marks after the head, as written ({across}). */
  readonly attributes?: string;
  /** Header first, then the rows; every row as long as the header. */
  readonly rows: readonly (readonly string[])[];
}

const HEAD = /^\s*table[ \t]+(.*?)[ \t]*:[ \t]*(\{[^{}]*\})?[ \t]*$/;

/** The cells of a table's text; undefined when the text is no table. */
export function parseSheetTable(text: string): SheetTableCells | undefined {
  const [head, ...lines] = text.split(/\r?\n/);
  const match = HEAD.exec(head ?? '');
  const name = match?.[1];
  if (name === undefined) return undefined;
  const rows = lines
    .filter((line) => /^[ \t]+\|/.test(line))
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  const width = Math.max(1, ...rows.map((r) => r.length));
  return { name, ...(match?.[2] ? { attributes: match[2] } : {}), rows: (rows.length > 0 ? rows : [['']]).map((r) => [...r, ...Array<string>(width - r.length).fill('')]) };
}

/** The text of a table from its cells, columns padded to the widest cell. */
export function formatSheetTable(table: SheetTableCells): string {
  const width = Math.max(1, ...table.rows.map((r) => r.length));
  const sizes = Array.from({ length: width }, (_, c) => Math.max(1, ...table.rows.map((r) => [...(r[c] ?? '')].length)));
  const pad = (cell: string, c: number) => cell + ' '.repeat(sizes[c]! - [...cell].length);
  const line = (r: readonly string[]) => `    | ${Array.from({ length: width }, (_, c) => pad(r[c] ?? '', c)).join(' | ')} |`;
  return [`table ${table.name}:${table.attributes ? ` ${table.attributes}` : ''}`, ...table.rows.map(line)].join('\n');
}

/** A cell written; the others as they were. */
export function setSheetCell(table: SheetTableCells, row: number, column: number, value: string): SheetTableCells {
  return { ...table, rows: table.rows.map((r, i) => (i === row ? r.map((c, j) => (j === column ? value : c)) : r)) };
}

/** An empty row after `after` (the last row when left out). */
export function addSheetRow(table: SheetTableCells, after = table.rows.length - 1): SheetTableCells {
  const width = table.rows[0]?.length ?? 1;
  return { ...table, rows: [...table.rows.slice(0, after + 1), Array<string>(width).fill(''), ...table.rows.slice(after + 1)] };
}

export function deleteSheetRow(table: SheetTableCells, row: number): SheetTableCells {
  return row <= 0 ? table : { ...table, rows: table.rows.filter((_, i) => i !== row) };
}

/** A column at the end, its header given. */
export function addSheetColumn(table: SheetTableCells, header: string): SheetTableCells {
  return { ...table, rows: table.rows.map((r, i) => [...r, i === 0 ? header : '']) };
}

/** A column taken away; the last one stays. */
export function deleteSheetColumn(table: SheetTableCells, column: number): SheetTableCells {
  return (table.rows[0]?.length ?? 0) <= 1 ? table : { ...table, rows: table.rows.map((r) => r.filter((_, j) => j !== column)) };
}

/** A decimal point of the text as the user's locale writes it (20.1 -> 20,1), and back. */
export function cellShown(cell: string, decimalComma: boolean): string {
  return decimalComma ? cell.replace(/(\d)\.(\d)/g, '$1,$2') : cell;
}

export function cellWritten(cell: string, decimalComma: boolean): string {
  return decimalComma ? cell.replace(/(\d),(\d)/g, '$1.$2') : cell;
}
