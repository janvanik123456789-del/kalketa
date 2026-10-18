/**
 * Insert > Fit a curve…: the points of the sheet, a method in two groups (near the points,
 * through them all), where the curve goes (a chart of its own, a chart the sheet has, none),
 * and the curve as it will print, before anything is written into the sheet.
 * Opened from a fitted curve in a chart, the same dialog edits that curve in place.
 */

import { useEffect, useMemo, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import {
  APPROXIMATE,
  curveName,
  fitEdits,
  fits,
  hasSteps,
  INTERPOLATE,
  MAX_DEGREE,
  type FitChart,
  type FitChoice,
  type FitMethod,
  type FitSeries,
  type FitTarget,
  type LineEdit,
} from '../logic/curveFit.js';
import { Dialog } from './Dialogs.js';

interface FitDialogProps {
  readonly catalog: Catalog;
  /** The numeric series of the sheet (columns of tables, series of numbers). */
  readonly series: readonly FitSeries[];
  /** Names the sheet has, so the curve gets a new one. */
  readonly taken: ReadonlySet<string>;
  /** The charts of the sheet a new curve can join. */
  readonly charts: readonly FitChart[];
  /** The line a new curve goes after (with a chart of its own, or none). */
  readonly after: number;
  /** A curve of the sheet being edited: its choice and lines; it is rewritten in place. */
  readonly editing?: { readonly choice: FitChoice; readonly start: number; readonly end: number };
  /** The edits as they will print: HTML of the blocks they write and of the charts with the curve. */
  preview(edits: readonly LineEdit[], name: string): string;
  onApply(edits: readonly LineEdit[]): void;
  onClose(): void;
}

export function FitDialog({ catalog, series, taken, charts, after, editing, preview, onApply, onClose }: FitDialogProps) {
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  const start = editing?.choice;
  const indexOf = (s: FitSeries | undefined, fallback: number) => Math.max(0, s ? series.findIndex((o) => o.expr === s.expr) : fallback);
  // y: the last series, x: the one before it (a table of x, y reads that way).
  const [xIndex, setXIndex] = useState(indexOf(start?.x, series.length - 2));
  const [yIndex, setYIndex] = useState(indexOf(start?.y, series.length - 1));
  const [method, setMethod] = useState<FitMethod>(start?.method ?? 'line');
  const [degree, setDegree] = useState(start?.degree ?? 2);
  const [steps, setSteps] = useState(start?.steps ?? false);
  // Where the curve goes: "new" (a chart of its own), "none", or the line of a chart of the sheet.
  const [place, setPlace] = useState('new');
  const [ownName, setOwnName] = useState<string | undefined>(start?.name);
  const x = series[xIndex];
  const y = series[yIndex];
  const name = ownName ?? (y ? curveName(y, method, taken) : '');
  const usable = (m: FitMethod) => !!x && !!y && fits(m, x, y, degree);
  const chart = charts.find((c) => String(c.line) === place);
  const target: FitTarget = editing ? { kind: 'replace', start: editing.start, end: editing.end } : chart ? { kind: 'chart', chart } : { kind: 'new', after };
  const choice: FitChoice | undefined = x && y && usable(method) && /^\p{L}[\p{L}\p{N}_]*$/u.test(name) ? { x, y, method, degree, name, steps, chart: place === 'new' } : undefined;
  const edits = useMemo(() => (choice ? fitEdits(choice, target) : []), [choice?.x, choice?.y, method, degree, name, steps, place]);
  const lines = edits.flatMap((e) => e.lines);

  // The preview follows the choice after a short pause (the sheet is calculated with the edits).
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (edits.length === 0) return setHtml('');
    const timer = setTimeout(() => {
      try {
        setHtml(preview(edits, name));
      } catch {
        setHtml('');
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [lines.join('\n')]);

  if (series.length < 2) {
    return (
      <Dialog title={say('fit.title')} catalog={catalog} onClose={onClose}>
        <p>{say('fit.noSeries')}</p>
      </Dialog>
    );
  }
  const option = (m: FitMethod) => (
    <label key={m} className={`fit-method${usable(m) ? '' : ' disabled'}`} title={usable(m) ? say(`fit.tip.${m}` as UiKey) : say('fit.notHere')}>
      <input type="radio" name="fit-method" data-method={m} checked={method === m} disabled={!usable(m)} onChange={() => setMethod(m)} />
      <span>{say(`fit.method.${m}` as UiKey)}</span>
      {m === 'poly' && (
        <input
          type="number"
          className="fit-degree"
          min={2}
          max={MAX_DEGREE}
          value={degree}
          aria-label={say('fit.degree')}
          title={say('fit.degree')}
          onChange={(e) => {
            setDegree(Math.min(MAX_DEGREE, Math.max(2, Math.round(Number(e.target.value) || 2))));
            setMethod('poly');
          }}
        />
      )}
    </label>
  );
  const pick = (value: number, set: (i: number) => void, label: UiKey) => (
    <label className="fit-series">
      <span>{say(label)}</span>
      <select value={value} onChange={(e) => set(Number(e.target.value))}>
        {series.map((s, i) => (
          <option key={s.expr} value={i}>
            {s.expr} ({say('fit.points', { n: s.length })})
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Dialog title={say(editing ? 'fit.editTitle' : 'fit.title')} catalog={catalog} wide onClose={onClose} onOk={() => choice && onApply(edits)}>
      <div className="fit-dialog">
        <div className="fit-options">
          {pick(xIndex, setXIndex, 'fit.x')}
          {pick(yIndex, setYIndex, 'fit.y')}
          <fieldset>
            <legend>{say('fit.approximate')}</legend>
            {APPROXIMATE.map(option)}
          </fieldset>
          <fieldset>
            <legend>{say('fit.interpolate')}</legend>
            {INTERPOLATE.map(option)}
          </fieldset>
          <label className="fit-name" title={editing ? say('fit.nameKept') : undefined}>
            <span>{say('fit.name')}</span>
            {/* An edited curve keeps its name: the lines that use it stay right. */}
            <input value={name} disabled={!!editing} onChange={(e) => setOwnName(e.target.value.trim())} />
          </label>
          <label className={hasSteps(method) ? '' : 'disabled'}>
            <input type="checkbox" checked={steps && hasSteps(method)} disabled={!hasSteps(method)} onChange={(e) => setSteps(e.target.checked)} />
            {say('fit.steps')}
          </label>
          {!editing && (
            <label className="fit-series">
              <span>{say('fit.chart')}</span>
              <select className="fit-place" value={place} onChange={(e) => setPlace(e.target.value)}>
                <option value="new">{say('fit.chartNew')}</option>
                {charts.map((c) => (
                  <option key={c.line} value={String(c.line)}>
                    {say('fit.chartJoin', { chart: c.label })}
                  </option>
                ))}
                <option value="none">{say('fit.chartNone')}</option>
              </select>
            </label>
          )}
          <p className="hint">{usable(method) ? say(`fit.tip.${method}` as UiKey) : say('fit.notHere')}</p>
          <pre className="fit-lines">{lines.join('\n')}</pre>
        </div>
        <div className="fit-preview page" aria-label={say('fit.preview')} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Dialog>
  );
}
