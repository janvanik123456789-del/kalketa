/**
 * A table written in the sheet, edited as a grid where it stands (docs/03-jazyk.md,
 * ch. 8.4): the header (name [unit] {format}) and the cells. Enter writes a cell
 * and goes one down (from the last row into a new one), Shift+Enter up, Tab right;
 * Esc ends the editing. Every change goes into the text of the sheet at once.
 */

import { useState, type KeyboardEvent } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import {
  addSheetColumn,
  addSheetRow,
  cellShown,
  cellWritten,
  deleteSheetColumn,
  deleteSheetRow,
  formatSheetTable,
  setSheetCell,
  type SheetTableCells,
} from '../logic/sheetTableEdit.js';

interface Props {
  readonly table: SheetTableCells;
  readonly decimalComma: boolean;
  readonly catalog: Catalog;
  onChange(text: string): void;
  onDone(): void;
  /** The table as text instead (to rename it, or write what the grid does not offer). */
  onText(): void;
}

export function SheetTableGrid({ table: initial, decimalComma, catalog, onChange, onDone, onText }: Props) {
  // The grid keeps its own cells while it is open; the sheet gets each change as text.
  const [table, setTable] = useState(initial);
  const change = (next: SheetTableCells) => {
    setTable(next);
    onChange(formatSheetTable(next));
  };
  const focus = (row: number, column: number) =>
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`.sheet-table-grid input[data-cell="${row}:${column}"]`);
      input?.focus();
      input?.select();
    });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onDone();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const written = setSheetCell(table, row, column, cellWritten(e.currentTarget.value, decimalComma));
    if (e.shiftKey) {
      change(written);
      focus(Math.max(0, row - 1), column);
    } else if (row === table.rows.length - 1) {
      change(addSheetRow(written));
      focus(row + 1, column);
    } else {
      change(written);
      focus(row + 1, column);
    }
  };

  return (
    <div className="sheet-table-grid" onMouseDown={(e) => e.stopPropagation()}>
      <div className="sheet-table-head">
        <strong>{table.name}</strong>
        <button type="button" className="secondary" onClick={() => change(addSheetRow(table))}>
          + {t(catalog, 'sheetTable.row')}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const width = table.rows[0]?.length ?? 0;
            change(addSheetColumn(table, `c${width + 1}`));
            focus(0, width);
          }}
        >
          + {t(catalog, 'sheetTable.column')}
        </button>
        <button type="button" className="secondary" onClick={onText}>
          {t(catalog, 'sheetTable.asText')}
        </button>
        <button type="button" className="secondary" onClick={onDone}>
          {t(catalog, 'sheetTable.done')}
        </button>
      </div>
      <table className="grid">
        <tbody>
          {table.rows.map((cells, row) => (
            <tr key={row} className={row === 0 ? 'header' : ''}>
              {cells.map((cell, column) => (
                <td key={column}>
                  <input
                    // Remounted with new cells from outside (a row added, a column taken away).
                    key={`${row}:${column}:${cell}`}
                    data-cell={`${row}:${column}`}
                    defaultValue={cellShown(cell, decimalComma)}
                    title={row === 0 ? t(catalog, 'sheetTable.headerHint') : undefined}
                    // A cell of a calculated column left empty gets its value from the formula.
                    placeholder={row > 0 && (table.rows[0]?.[column] ?? '').includes('=') ? t(catalog, 'sheetTable.computed') : undefined}
                    onBlur={(e) => {
                      const value = cellWritten(e.target.value, decimalComma);
                      if (value !== cell) change(setSheetCell(table, row, column, value));
                    }}
                    onKeyDown={(e) => onKeyDown(e, row, column)}
                  />
                </td>
              ))}
              <td className="row-tools">
                {row === 0 ? null : (
                  <button type="button" className="icon" title={t(catalog, 'editor.deleteRow')} onClick={() => change(deleteSheetRow(table, row))}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr className="column-tools">
            {(table.rows[0] ?? []).map((_, column) => (
              <td key={column}>
                <button type="button" className="icon" title={t(catalog, 'editor.deleteColumn')} onClick={() => change(deleteSheetColumn(table, column))}>
                  ×
                </button>
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
