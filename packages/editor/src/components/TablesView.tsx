/**
 * Table editor: the data layer of the sheet. Typed columns with units,
 * images per row, import from CSV and Excel.
 */

import { useEffect, useRef, useState } from 'react';
import type { ColumnSchema, ColumnType, Diagnostic } from '@kalketa/core';
import { formatDiagnostic, t, type Catalog } from '@kalketa/i18n';
import { toIdentifier, type SheetDocument, type StoredTable } from '@kalketa/sheet';
import { chooseFile } from '../document.js';
import { ask, askConfirm } from './Ask.js';
import { ContextMenu } from './MenuBar.js';
import { commandIcon } from '../icons.js';
import { addColumn, addRow, deleteColumn, deleteRow, fromEditable, deleteTable, pasteGrid, renameTable, setCell, usedTables, toEditable, unitWithPowers, type EditableTable } from '../logic/tableEdit.js';
import { createTable, importTableFile, withTable, type TableChange } from '../tableActions.js';

interface Props {
  readonly doc: SheetDocument;
  readonly catalog: Catalog;
  readonly diagnostics: readonly Diagnostic[];
  readonly resolveFile: (path: string) => string | undefined;
  onChange(doc: SheetDocument): void;
  /** Narrow layout for the side panel: table list on top. */
  readonly compact?: boolean;
  /** Only these tables (the tables of one data layer); all when absent. */
  readonly names?: readonly string[];
  /** Puts a newly created or imported table into its layer. */
  assign?(doc: SheetDocument, name: string): SheetDocument;
}

const IMAGE_COLUMN = 'obrazek';

export function TablesView({ doc, catalog, diagnostics, resolveFile, onChange, compact, names: only, assign }: Props) {
  const names = only ? only.filter((n) => doc.tables.has(n)) : [...doc.tables.keys()];
  const [active, setActive] = useState<string | undefined>(names[0]);
  // A table that comes into the layer from outside (Ctrl+V of a table, the Insert menu) is shown at once.
  const known = useRef(new Set(names));
  const added = names.find((n) => !known.current.has(n));
  useEffect(() => {
    if (added) setActive(added);
    known.current = new Set(names);
  });
  const [messages, setMessages] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ name: string; at: { x: number; y: number } } | undefined>();
  const rename = (name: string) =>
    void ask(t(catalog, 'editor.tableRename'), name).then((answer) => {
      const to = toIdentifier(answer ?? '');
      if (!answer || to === name) return;
      const renamed = renameTable(doc, name, to);
      if (!renamed) return setMessages([t(catalog, 'editor.tableRenameFailed', { name: to })]);
      setMessages([]);
      setActive(to);
      onChange(renamed);
    });
  // Undo brings a deleted table back; a table the sheet reads is said so before.
  const remove = (name: string) =>
    void askConfirm(t(catalog, used.has(name) ? 'editor.tableDeleteUsed' : 'editor.tableDeleteAsk', { name })).then((yes) => {
      if (!yes) return;
      setActive(undefined);
      onChange(deleteTable(doc, name));
    });
  const current = active && names.includes(active) ? active : names[0];
  // A table no calculation reads is red: the one edited may not be the one the sheet takes its values from.
  const used = usedTables(doc);

  const putTable = (name: string, stored: StoredTable, files?: ReadonlyMap<string, Uint8Array>) => onChange(withTable(doc, name, stored, files));

  const edit = (table: EditableTable | undefined) => {
    if (table && current) putTable(current, fromEditable(table));
  };

  const apply = (result: TableChange | undefined) => {
    if (!result) return;
    onChange(assign ? assign(result.doc, result.name) : result.doc);
    setActive(result.name);
    setMessages(result.messages);
  };

  return (
    <div className={`tables-view${compact ? ' compact' : ''}`}>
      <nav className="table-list">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            className={`${name === current ? 'active' : ''}${used.has(name) ? '' : ' unused'}`.trim()}
            title={used.has(name) ? t(catalog, 'editor.tableRenameHint') : `${t(catalog, 'editor.tableUnused')} ${t(catalog, 'editor.tableRenameHint')}`}
            onClick={() => setActive(name)}
            onContextMenu={(e) => {
              // The right button: rename the table (in the sheet too) or delete it.
              e.preventDefault();
              setMenu({ name, at: { x: e.clientX, y: e.clientY } });
            }}
          >
            {name}
          </button>
        ))}
        <button type="button" className="table-action" title={t(catalog, 'editor.newTable')} onClick={async () => apply(await createTable(doc, catalog))}>
          {commandIcon('insert.newTable') ?? '+'}
        </button>
        <button type="button" className="table-action" title={t(catalog, 'editor.importTable')} onClick={async () => apply(await importTableFile(doc, catalog))}>
          {commandIcon('insert.importTable') ?? '⇩'}
        </button>
      </nav>
      {menu && (
        <ContextMenu
          at={menu.at}
          commands={new Map()}
          onClose={() => setMenu(undefined)}
          items={[
            { kind: 'action', label: t(catalog, 'editor.tableRenameItem'), run: () => rename(menu.name) },
            { kind: 'action', label: t(catalog, 'editor.tableDelete'), run: () => remove(menu.name) },
          ]}
        />
      )}
      <section className="table-panel">
        {messages.length > 0 && (
          <ul className="messages">
            {messages.map((m, i) => (
              <li key={i} className="warning">
                {m}
              </li>
            ))}
          </ul>
        )}
        {diagnostics.length > 0 && (
          <ul className="messages">
            {diagnostics.map((d, i) => (
              <li key={i} className={d.severity}>
                {formatDiagnostic(d, catalog)}
              </li>
            ))}
          </ul>
        )}
        {current ? (
          <TableGrid
            key={current}
            table={toEditable(doc.tables.get(current)!)}
            catalog={catalog}
            resolveFile={resolveFile}
            onChange={edit}
            onImage={async (row, table) => {
              const file = await chooseFile('image/*');
              if (!file) return;
              const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
              const key = table.rows[row]?.[0] || `radek_${row + 1}`;
              const fileName = `${key.replace(/[^\p{L}\p{Nd}._-]+/gu, '_')}.${ext}`;
              let next = table;
              let column = next.schema.columns.findIndex((c) => c.name === IMAGE_COLUMN);
              if (column === -1) {
                next = addColumn(next, { name: IMAGE_COLUMN, type: 'text' })!;
                column = next.schema.columns.length - 1;
              }
              next = setCell(next, row, column, fileName);
              next = { ...next, schema: { ...next.schema, image: `images/${current}/{${IMAGE_COLUMN}}` } };
              putTable(current, fromEditable(next), new Map([[`images/${current}/${fileName}`, new Uint8Array(await file.arrayBuffer())]]));
            }}
          />
        ) : (
          <p className="muted">{t(catalog, 'editor.noTables')}</p>
        )}
      </section>
    </div>
  );
}

interface GridProps {
  readonly table: EditableTable;
  readonly catalog: Catalog;
  readonly resolveFile: (path: string) => string | undefined;
  onChange(table: EditableTable | undefined): void;
  onImage(row: number, table: EditableTable): void;
}

function TableGrid({ table, catalog, resolveFile, onChange, onImage }: GridProps) {
  const { schema } = table;
  const imageColumn = schema.columns.findIndex((c) => c.name === IMAGE_COLUMN);

  const updateColumn = (index: number, change: Partial<ColumnSchema>) => {
    const columns = schema.columns.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...change } as ColumnSchema & { unit?: string };
      if (next.type !== 'quantity' || !next.unit) {
        const { unit: _unit, ...rest } = next;
        return rest as ColumnSchema;
      }
      return next as ColumnSchema;
    });
    onChange({ ...table, schema: { ...schema, columns } });
  };

  const newColumn = async () => {
    const name = toIdentifier((await ask(t(catalog, 'editor.columnName'))) ?? '');
    if (name) onChange(addColumn(table, { name, type: 'quantity' }));
  };

  const imageFor = (row: number) => {
    if (!schema.image || imageColumn === -1) return undefined;
    const file = table.rows[row]?.[imageColumn];
    return file ? resolveFile(schema.image.replace(`{${IMAGE_COLUMN}}`, file)) : undefined;
  };

  return (
    <div className="grid-wrap">
      <div className="table-meta">
        <strong>{schema.name}</strong>
        {schema.source && <span className="muted"> · {schema.source.title}</span>}
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th />
            {schema.columns.map((c, i) => (
              <th key={i}>
                <div className="col-name">{c.name}</div>
                <div className="col-meta">
                  <select value={c.type} onChange={(e) => updateColumn(i, { type: e.target.value as ColumnType })} title={t(catalog, 'editor.columnType')}>
                    <option value="quantity">{t(catalog, 'editor.type.quantity')}</option>
                    <option value="text">{t(catalog, 'editor.type.text')}</option>
                    <option value="boolean">{t(catalog, 'editor.type.boolean')}</option>
                    <option value="date">{t(catalog, 'editor.type.date')}</option>
                  </select>
                  {c.type === 'quantity' && (
                    <input
                      className="unit"
                      defaultValue={c.unit ?? ''}
                      placeholder={t(catalog, 'editor.columnUnit')}
                      onBlur={(e) => {
                        // Written as it reads: kg/m3 and kg/m^3 become kg/m³ (no ³ on the keyboard, ^ a dead key).
                        const unit = unitWithPowers(e.target.value.trim());
                        e.target.value = unit;
                        if (unit !== (c.unit ?? '')) updateColumn(i, { unit });
                      }}
                    />
                  )}
                  {i > 0 && (
                    <button type="button" className="icon" title={t(catalog, 'editor.deleteColumn')} onClick={() => onChange(deleteColumn(table, i))}>
                      ×
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th>
              <button type="button" className="icon" title={t(catalog, 'editor.addColumn')} onClick={newColumn}>
                +
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            // Keyed by content: inputs keep their own text until blur, so a changed row must remount.
            <tr key={`${r}:${row.join('\u0001')}`}>
              <td className="row-tools">
                {imageFor(r) ? <img className="thumb" src={imageFor(r)} alt="" /> : null}
                <button type="button" className="icon" title={t(catalog, 'editor.uploadImage')} onClick={() => onImage(r, table)}>
                  🖼
                </button>
              </td>
              {row.map((cell, c) => (
                <td key={c} className={schema.columns[c]?.type === 'quantity' ? 'num' : ''}>
                  <input
                    defaultValue={cell}
                    data-cell={`${r}:${c}`}
                    onFocus={(e) => delete e.currentTarget.dataset['written']}
                    onPaste={(e) => {
                      // A table pasted into a cell (from Excel, a model's answer) fills the cells from here, as a spreadsheet does.
                      const pasted = pasteGrid(table, r, c, e.clipboardData.getData('text/plain'));
                      if (!pasted) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.dataset['written'] = '1';
                      onChange(pasted);
                    }}
                    onBlur={(e) => !e.target.dataset['written'] && e.target.value !== cell && onChange(setCell(table, r, c, e.target.value))}
                    onKeyDown={(e) => {
                      // Enter writes the cell and goes one down, as in a spreadsheet (Shift+Enter up); Tab goes right by itself.
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const next = `${r + (e.shiftKey ? -1 : 1)}:${c}`;
                      if (!e.shiftKey && r === table.rows.length - 1) {
                        // From the last row a new one: the cell and the row in one change (its blur writes nothing more).
                        const value = e.currentTarget.value;
                        e.currentTarget.dataset['written'] = '1';
                        onChange(addRow(value !== cell ? setCell(table, r, c, value) : table));
                      } else {
                        e.currentTarget.blur();
                      }
                      // After the written cell renders (a timeout, not a frame: a hidden window draws none).
                      setTimeout(() => {
                        const target = document.querySelector<HTMLInputElement>(`.grid input[data-cell="${next}"]`);
                        target?.focus();
                        target?.select();
                      });
                    }}
                  />
                </td>
              ))}
              <td>
                <button type="button" className="icon" title={t(catalog, 'editor.deleteRow')} onClick={() => onChange(deleteRow(table, r))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="secondary" onClick={() => onChange(addRow(table))}>
        + {t(catalog, 'editor.addRow')}
      </button>
    </div>
  );
}
