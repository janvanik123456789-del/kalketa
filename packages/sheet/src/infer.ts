/**
 * Turns an imported grid (CSV or Excel sheet) into a table schema.
 *
 * The header row carries column names and units: "Wy [cm³]", "h (mm)" or
 * just "oznaceni". A column is numeric when all its non-empty cells are
 * numbers. Unknown units are reported so the user can fix them; the program
 * never guesses a unit silently.
 */

import { diagnostic, NO_SPAN, type ColumnSchema, type Diagnostic, type TableSchema, type UnitRegistry } from '@kalketa/core';

export interface InferResult {
  readonly schema: TableSchema;
  /** Data rows without the header, with numbers normalized to "." decimals. */
  readonly rows: string[][];
  readonly diagnostics: Diagnostic[];
}

const HEADER = /^\s*(.+?)\s*(?:\[(.+)\]|\((.+)\))\s*$/u;

export function inferTable(name: string, grid: readonly (readonly string[])[], registry: UnitRegistry): InferResult {
  const diagnostics: Diagnostic[] = [];
  const [header = [], ...data] = grid;
  const width = Math.max(header.length, ...data.map((r) => r.length));

  const columns: ColumnSchema[] = [];
  const numeric: boolean[] = [];
  for (let c = 0; c < width; c++) {
    const { name: columnName, unit } = splitHeader(header[c] ?? '', c);
    const cells = data.map((r) => (r[c] ?? '').trim()).filter((t) => t !== '');
    const isNumeric = cells.length > 0 && cells.every((t) => normalizeNumber(t) !== undefined);
    numeric.push(isNumeric);

    if (!isNumeric) {
      columns.push({ name: columnName, type: 'text' });
      continue;
    }
    if (unit && !isKnownUnit(unit, registry)) {
      diagnostics.push(diagnostic('W-TABLE-UNIT', NO_SPAN, { table: name, column: columnName, unit }));
      columns.push({ name: columnName, type: 'quantity' });
      continue;
    }
    columns.push({ name: columnName, type: 'quantity', ...(unit ? { unit } : {}) });
  }

  const rows = data.map((r) =>
    Array.from({ length: width }, (_, c) => {
      const text = (r[c] ?? '').trim();
      return numeric[c] && text !== '' ? normalizeNumber(text)! : text;
    }),
  );

  const schema: TableSchema = { name: toIdentifier(name), key: columns[0]?.name ?? '', columns };
  return { schema, rows, diagnostics };
}

/** "Wy [cm³]" -> { name: "Wy", unit: "cm³" }; names become valid identifiers. */
export function splitHeader(text: string, index: number): { name: string; unit?: string } {
  const match = HEADER.exec(text);
  const rawName = match ? match[1]! : text.trim();
  const unit = match ? (match[2] ?? match[3])!.trim() : undefined;
  const name = toIdentifier(rawName) || `sloupec_${index + 1}`;
  return unit ? { name, unit: normalizeUnitText(unit) } : { name };
}

/** Letters, digits and "_" only, starting with a letter: "Wy,el" -> "Wy_el". */
export function toIdentifier(text: string): string {
  const cleaned = text
    .normalize('NFC')
    .replace(/[^\p{L}\p{Nd}\p{M}_]+/gu, '_')
    .replace(/^_+|_+$/g, '');
  return /^\p{L}/u.test(cleaned) ? cleaned : cleaned ? `c_${cleaned}` : '';
}

/** Excel headers often write "cm3" or "kg/m3"; turn trailing digits into powers. */
function normalizeUnitText(unit: string): string {
  return unit.replace(/([a-zA-Zµμ])([234])(?![\d])/g, (_, letter: string, digit: string) => letter + { '2': '²', '3': '³', '4': '⁴' }[digit]);
}

function isKnownUnit(unit: string, registry: UnitRegistry): boolean {
  // Split on operators and powers; every remaining symbol must be a unit.
  const symbols = unit.split(/[·*/()^⁻¹²³⁴⁵⁶⁷⁸⁹⁰\d\s-]+/u).filter((s) => s !== '');
  return symbols.length > 0 && symbols.every((s) => registry.isUnit(s));
}

function normalizeNumber(text: string): string | undefined {
  let t = text.replace(/[\s  ]/g, '');
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? t : undefined;
}
