/**
 * Details of the selected line: value, messages and where the value comes
 * from (formulas, inputs, table rows and their sources). Clicking an input
 * jumps to its line.
 */

import { toDecimalComma, traceStatement, type SheetResult, type TraceNode } from '@kalketa/core';
import { formatDiagnostic, formatValue, t, type Catalog } from '@kalketa/i18n';
import { useEffect, useState } from 'react';
import { helpNamesOfLine, helpOf } from '../logic/functionHelp.js';

interface Props {
  readonly result: SheetResult;
  readonly statement: number | undefined;
  /** The text of the selected line: its functions are explained. */
  readonly line?: string;
  readonly catalog: Catalog;
  /** Formulas are shown in the user's notation (50,5). */
  readonly decimalComma: boolean;
  onSelect(statement: number): void;
  /** Opens the layer a value was taken from. */
  onLayer(layer: string): void;
}

/**
 * What the help of the line being typed is about (its functions, the one at the cursor first, and its kind:
 * solve …); undefined when no line is edited. Followed a moment after the user stops typing or moving, and the
 * pane drawn again only when it changes: typing stays as quick as without it.
 */
function useEditedHelp(): readonly string[] | undefined {
  const [names, setNames] = useState<string | undefined>();
  useEffect(() => {
    let timer: number | undefined;
    const read = () => {
      const area = document.activeElement;
      if (!(area instanceof HTMLTextAreaElement) || !area.classList.contains('row-editor')) return setNames(undefined);
      setNames(helpNamesOfLine(area.value, area.selectionStart).join(' '));
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 150);
    };
    const events = ['keyup', 'click', 'focusin', 'focusout'] as const;
    for (const e of events) document.addEventListener(e, later, true);
    return () => {
      window.clearTimeout(timer);
      for (const e of events) document.removeEventListener(e, later, true);
    };
  }, []);
  return names === undefined ? undefined : names.split(' ').filter(Boolean);
}

/** How the functions of the line (and the line itself: solve …) are written: the one at the cursor first, while typing. */
function HowToWrite({ names, catalog, decimalComma }: { names: readonly string[]; catalog: Catalog; decimalComma: boolean }) {
  const helps = names.flatMap((name) => helpOf(name, catalog, decimalComma) ?? []);
  if (helps.length === 0) return null;
  return (
    <section className="how-to-write">
      <h3>{t(catalog, 'editor.howToWrite')}</h3>
      {helps.slice(0, 3).map((help) => {
        return (
          <div key={help.name} className="how-to-write-function">
            <code className="how-to-write-signature">{help.signature}</code>
            <p>{help.summary}</p>
            <pre className="how-to-write-example">{help.shortExample}</pre>
          </div>
        );
      })}
    </section>
  );
}

export function Inspector({ result, statement, line = '', catalog, decimalComma, onSelect, onLayer }: Props) {
  const functions = useEditedHelp() ?? helpNamesOfLine(line);
  const r = statement !== undefined ? result.statements[statement] : undefined;
  if (!r || (r.statement.kind !== 'definition' && r.statement.kind !== 'display' && r.statement.kind !== 'check' && r.statement.kind !== 'invalid')) {
    return (
      <aside className="inspector">
        <h2>{t(catalog, 'editor.details')}</h2>
        {functions.length === 0 && <p className="muted">{t(catalog, 'editor.nothingSelected')}</p>}
        <HowToWrite names={functions} catalog={catalog} decimalComma={decimalComma} />
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
            <TraceItem node={trace} catalog={catalog} decimalComma={decimalComma} onSelect={onSelect} onLayer={onLayer} />
          </ul>
        </section>
      )}
      <HowToWrite names={functions} catalog={catalog} decimalComma={decimalComma} />
      <p className="help">{t(catalog, 'editor.help')}</p>
    </aside>
  );
}

function TraceItem({ node, catalog, decimalComma, onSelect, onLayer }: { node: TraceNode; catalog: Catalog; decimalComma: boolean; onSelect(statement: number): void; onLayer(layer: string): void }) {
  const value = node.display
    ? formatValue(node.display.value, node.display.im, node.display.unit, catalog)
    : node.value?.type === 'row'
      ? node.value.label
      : node.value?.type === 'boolean'
        ? (catalog.terms[String(node.value.value)] ?? String(node.value.value))
        : node.value?.type === 'matrix'
          ? `${node.value.rows}×${node.value.cols}`
          : node.value?.type === 'vector'
            ? `[${node.value.items.length}]`
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
      {node.layer && (
        <button type="button" className="layer-ref" onClick={() => onLayer(node.layer!.id)}>
          {t(catalog, 'trace.layer')} <strong>{node.layer.name}</strong>
        </button>
      )}
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
            <TraceItem key={`i${i}`} node={input} catalog={catalog} decimalComma={decimalComma} onSelect={onSelect} onLayer={onLayer} />
          ))}
        </ul>
      )}
    </li>
  );
}
