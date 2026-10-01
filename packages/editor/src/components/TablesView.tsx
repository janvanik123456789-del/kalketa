/**
 * Table editor: the data layer of the sheet. Typed columns with units,
 * images per row, import from CSV and Excel.
 */

import { useState } from 'react';
import type { ColumnSchema, ColumnType, Diagnostic } from '@kalketa/core';
import { formatDiagnostic, t, type Catalog } from '@kalketa/i18n';
import { toIdentifier, type SheetDocument, type StoredTable } from '@kalketa/sheet';
import { chooseFile } from '../document.js';
import { ask } from './Ask.js';
import { commandIcon } from '../icons.js';
import { addColumn, addRow, deleteColumn, deleteRow, fromEditable, setCell, toEditable, type EditableTable } from '../logic/tableEdit.js';
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
  const [messages, setMessages] = useState<string[]>([]);
  const current = active && names.includes(active) ? active : names[0];

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
          <button key={name} type="button" className={name === current ? 'active' : ''} onClick={() => setActive(name)}>
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
                      onBlur={(e) => e.target.value !== (c.unit ?? '') && updateColumn(i, { unit: e.target.value.trim() })}
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
                  <input defaultValue={cell} onBlur={(e) => e.target.value !== cell && onChange(setCell(table, r, c, e.target.value))} />
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
