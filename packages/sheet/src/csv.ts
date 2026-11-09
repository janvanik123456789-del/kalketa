/**
 * CSV reading and writing (RFC 4180 quoting).
 *
 * Czech Excel exports use ";" as the delimiter and a decimal comma, so the
 * delimiter is detected from the header line.
 */

const DELIMITERS = [';', ',', '\t'] as const;

export function detectDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = splitRecord(header, delimiter).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parses CSV text into rows of cell strings. Empty trailing lines are dropped
 * (files from spreadsheets end with them), unless `keepEmpty`: the table
 * editor keeps a row just added, before anything is typed into it.
 */
export function parseCsv(text: string, delimiter = detectDelimiter(text), keepEmpty = false): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.startsWith('﻿') ? text.slice(1) : text; // BOM from Excel

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  while (!keepEmpty && rows.length > 0 && rows[rows.length - 1]!.every((c) => c === '')) rows.pop();
  return rows;
}

function splitRecord(line: string, delimiter: string): string[] {
  return parseCsv(line, delimiter)[0] ?? [];
}

/** Writes rows as CSV with "," and "." decimals, the canonical form inside a sheet. */
export function writeCsv(rows: readonly (readonly string[])[], delimiter = ','): string {
  const quote = (cell: string) => (/[",;\t\r\n]/.test(cell) || cell !== cell.trim() ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((row) => row.map(quote).join(delimiter)).join('\n') + '\n';
}

/**
 * A table from text pasted from elsewhere: cells of Excel (tabs), CSV, or a table of a model's answer written in
 * Markdown (| a | b | with a |---| line under its head), also inside a ``` block. Undefined when the text is no
 * table of at least two columns and a row under its head, every row as wide as the head.
 */
export function pastedTable(text: string): string[][] | undefined {
  const fenced = /```[^\n]*\n([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1]! : text).replace(/\r\n?/g, '\n').trim();
  if (!body.includes('\n')) return undefined;
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  let rows: string[][];
  if (lines.every((l) => l.startsWith('|'))) {
    // Markdown: the cells between the bars; the line of dashes under the head is no row.
    rows = lines
      .filter((l) => !/^\|[\s:|-]+\|?$/.test(l))
      .map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  } else {
    rows = parseCsv(lines.join('\n')).map((r) => r.map((c) => c.trim()));
  }
  const width = rows[0]?.length ?? 0;
  if (rows.length < 2 || width < 2 || rows.some((r) => r.length !== width)) return undefined;
  return rows;
}
