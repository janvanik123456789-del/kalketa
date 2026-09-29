/**
 * Reads .xlsx workbooks: cell grids and pictures anchored to rows.
 *
 * A picture placed over a row in Excel becomes that row's image, so a
 * catalogue kept in Excel with pictures next to the records imports as a
 * table with an image per record.
 */

import type ExcelJS from 'exceljs';

export interface WorkbookImage {
  /** 0-based row in the grid (row 0 is the header). */
  readonly row: number;
  readonly extension: string;
  readonly data: Uint8Array;
}

export interface WorkbookSheet {
  readonly name: string;
  readonly rows: string[][];
  readonly images: WorkbookImage[];
}

export async function readWorkbook(data: Uint8Array): Promise<WorkbookSheet[]> {
  // Loaded on first use: the library is large and only needed for Excel import.
  const { default: Excel } = await import('exceljs');
  const workbook = new Excel.Workbook();
  // ExcelJS's typings expect a Node Buffer; a Uint8Array view works the same.
  await workbook.xlsx.load(data as unknown as ArrayBuffer);
  const media = (workbook.model as unknown as { media?: { buffer?: Uint8Array; extension?: string }[] }).media ?? [];

  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cells[colNumber - 1] = cellText(cell.value);
      });
      rows[rowNumber - 1] = Array.from(cells, (c) => c ?? '');
    });
    const grid = Array.from(rows, (r) => r ?? []);

    const images: WorkbookImage[] = sheet.getImages().flatMap((image) => {
      const file = media[Number(image.imageId)];
      if (!file?.buffer) return [];
      const row = Math.floor(image.range.tl.nativeRow ?? image.range.tl.row);
      return [{ row, extension: file.extension ?? 'png', data: new Uint8Array(file.buffer) }];
    });

    return { name: sheet.name, rows: trimGrid(grid), images };
  });
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  if ('text' in value) return String(value.text);
  return '';
}

/** Drops empty rows at the end and empty columns on the right. */
function trimGrid(grid: string[][]): string[][] {
  const rows = [...grid];
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) rows.pop();
  const width = Math.max(0, ...rows.map((r) => r.reduce((w, c, i) => (c.trim() !== '' ? i + 1 : w), 0)));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}
