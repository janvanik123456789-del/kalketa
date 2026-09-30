/**
 * Drop-down for `pick(Table, "key")`: the table's rows with their images and
 * a few numeric columns, so a profile or material is chosen by looking.
 */

import { useEffect, useRef, useState } from 'react';
import { rowLabel, toDisplay, defaultRegistry, type Table } from '@calccanvas/core';

interface Props {
  readonly table: Table;
  readonly current: string;
  readonly resolveFile: (path: string) => string | undefined;
  /** Number format of the sheet's language (1 943 / 1,5). */
  readonly format: (value: number) => string;
  onChoose(key: string): void;
}

const SHOWN_COLUMNS = 4;

export function PickControl({ table, current, resolveFile, format, onChoose }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const numeric = table.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'quantity').slice(0, SHOWN_COLUMNS);
  const currentRow = table.rows.findIndex((_, r) => rowLabel(table, r) === current);

  return (
    <div className="pick-control" ref={ref}>
      <button type="button" className="pick-button" onClick={() => setOpen(!open)} title={table.name}>
        <Thumb table={table} row={currentRow} resolveFile={resolveFile} />
        <span>{current}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="pick-list" role="listbox">
          <table>
            <thead>
              <tr>
                <th />
                <th>{table.key}</th>
                {numeric.map(({ c }) => (
                  <th key={c.name}>
                    {c.name}
                    {c.unit ? ` [${c.unit}]` : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((cells, r) => {
                const label = rowLabel(table, r);
                return (
                  <tr
                    key={r}
                    role="option"
                    aria-selected={r === currentRow}
                    className={r === currentRow ? 'current' : ''}
                    onClick={() => {
                      setOpen(false);
                      if (label !== current) onChoose(label);
                    }}
                  >
                    <td>
                      <Thumb table={table} row={r} resolveFile={resolveFile} />
                    </td>
                    <td className="key">{label}</td>
                    {numeric.map(({ c, i }) => {
                      const cell = cells[i];
                      const shown = cell?.type === 'quantity' ? toDisplay(cell, defaultRegistry, c.resolvedUnit) : undefined;
                      return (
                        <td key={c.name} className="num">
                          {shown ? format(shown.value) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Thumb({ table, row, resolveFile }: { table: Table; row: number; resolveFile: (path: string) => string | undefined }) {
  if (!table.image || row < 0) return null;
  let missing = false;
  const path = table.image.replace(/\{([^}]+)\}/g, (_, column: string) => {
    const cell = table.rows[row]?.[table.columns.findIndex((c) => c.name === column)];
    if (cell?.type !== 'text' || !cell.value) missing = true;
    return cell?.type === 'text' ? cell.value : '';
  });
  const src = missing ? undefined : resolveFile(path);
  return src ? <img className="thumb" src={src} alt="" /> : null;
}
