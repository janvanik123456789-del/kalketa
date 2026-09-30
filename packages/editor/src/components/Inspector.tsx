/**
 * Details of the selected line: value, messages and where the value comes
 * from (formulas, inputs, table rows and their sources). Clicking an input
 * jumps to its line.
 */

import { toDecimalComma, traceStatement, type SheetResult, type TraceNode } from '@calccanvas/core';
import { formatDiagnostic, formatNumber, t, type Catalog } from '@calccanvas/i18n';

interface Props {
  readonly result: SheetResult;
  readonly statement: number | undefined;
  readonly catalog: Catalog;
  /** Formulas are shown in the user's notation (50,5). */
  readonly decimalComma: boolean;
  onSelect(statement: number): void;
}

export function Inspector({ result, statement, catalog, decimalComma, onSelect }: Props) {
  const r = statement !== undefined ? result.statements[statement] : undefined;
  if (!r || (r.statement.kind !== 'definition' && r.statement.kind !== 'display' && r.statement.kind !== 'check' && r.statement.kind !== 'invalid')) {
    return (
      <aside className="inspector">
        <h2>{t(catalog, 'editor.details')}</h2>
        <p className="muted">{t(catalog, 'editor.nothingSelected')}</p>
        <p className="help">{t(catalog, 'editor.help')}</p>
      </aside>
    );
  }

  const trace = r.statement.kind === 'invalid' ? undefined : traceStatement(result, statement!);
  return (
    <aside className="inspector">
      <h2>{t(catalog, 'editor.details')}</h2>
      {r.diagnostics.length > 0 && (
        <section>
          <h3>{t(catalog, 'editor.messages')}</h3>
          <ul className="messages">
            {r.diagnostics.map((d, i) => (
              <li key={i} className={d.severity}>
                <strong>{catalog.severity[d.severity]}</strong> {d.span.line > 0 ? `(${d.span.line}:${d.span.column}) ` : ''}
                {formatDiagnostic(d, catalog)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {trace && (
        <section>
          <h3>{t(catalog, 'editor.origin')}</h3>
          <ul className="trace">
            <TraceItem node={trace} catalog={catalog} decimalComma={decimalComma} onSelect={onSelect} />
          </ul>
        </section>
      )}
      <p className="help">{t(catalog, 'editor.help')}</p>
    </aside>
  );
}

function TraceItem({ node, catalog, decimalComma, onSelect }: { node: TraceNode; catalog: Catalog; decimalComma: boolean; onSelect(statement: number): void }) {
  const value = node.display
    ? `${formatNumber(node.display.value, catalog)}${node.display.unit ? ` ${node.display.unit}` : ''}`
    : node.value?.type === 'row'
      ? node.value.label
      : node.value?.type === 'boolean'
        ? (catalog.terms[String(node.value.value)] ?? String(node.value.value))
        : '';
  const computed = node.inputs.length > 0 || node.tables.length > 0;
  return (
    <li>
      <button type="button" className="trace-node" disabled={node.statement === undefined} onClick={() => node.statement !== undefined && onSelect(node.statement)}>
        <span className="name">{node.name || '·'}</span>
        {value && <span className="value"> = {value}</span>}
        {computed && node.expression && <span className="formula"> ← {decimalComma ? toDecimalComma(node.expression) : node.expression}</span>}
        {node.line !== undefined && <span className="line"> ({node.line})</span>}
      </button>
      {(node.tables.length > 0 || node.inputs.length > 0) && (
        <ul>
          {node.tables.map((ref, i) => (
            <li key={`t${i}`} className="table-ref">
              {t(catalog, 'trace.table')} <strong>{ref.table}</strong>, {t(catalog, ref.rows.length > 1 ? 'trace.rows' : 'trace.row')} {ref.rowLabels.join(' – ')}
              {ref.column ? `, ${t(catalog, 'trace.column')} ${ref.column}` : ''}
              {ref.weight !== undefined ? `, ${t(catalog, 'trace.interpolated')}` : ''}
              {ref.source && (
                <div className="source">
                  {t(catalog, 'trace.source')}: {ref.source.title}
                  {ref.source.retrieved ? ` (${ref.source.retrieved})` : ''}
                </div>
              )}
            </li>
          ))}
          {node.inputs.map((input, i) => (
            <TraceItem key={`i${i}`} node={input} catalog={catalog} decimalComma={decimalComma} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
