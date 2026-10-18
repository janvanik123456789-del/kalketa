/**
 * Insert > Fit a curve…: the points of the sheet, a method in two groups (near the points,
 * through them all), and the curve as it will print, before anything is written into the sheet.
 */

import { useEffect, useMemo, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { APPROXIMATE, curveName, fitLines, fits, hasSteps, INTERPOLATE, MAX_DEGREE, type FitChoice, type FitMethod, type FitSeries } from '../logic/curveFit.js';
import { Dialog } from './Dialogs.js';

interface FitDialogProps {
  readonly catalog: Catalog;
  /** The numeric series of the sheet (columns of tables, series of numbers). */
  readonly series: readonly FitSeries[];
  /** Names the sheet has, so the curve gets a new one. */
  readonly taken: ReadonlySet<string>;
  /** The lines as they will print: HTML of their blocks, calculated with the sheet above them. */
  preview(lines: readonly string[]): string;
  onInsert(lines: readonly string[]): void;
  onClose(): void;
}

export function FitDialog({ catalog, series, taken, preview, onInsert, onClose }: FitDialogProps) {
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  // y: the last series, x: the one before it (a table of x, y reads that way).
  const [xIndex, setXIndex] = useState(Math.max(0, series.length - 2));
  const [yIndex, setYIndex] = useState(Math.max(0, series.length - 1));
  const [method, setMethod] = useState<FitMethod>('line');
  const [degree, setDegree] = useState(2);
  const [steps, setSteps] = useState(false);
  const [chart, setChart] = useState(true);
  const [ownName, setOwnName] = useState<string | undefined>();
  const x = series[xIndex];
  const y = series[yIndex];
  const name = ownName ?? (y ? curveName(y, method, taken) : '');
  const usable = (m: FitMethod) => !!x && !!y && fits(m, x, y, degree);
  const choice: FitChoice | undefined = x && y && usable(method) && /^\p{L}[\p{L}\p{N}_]*$/u.test(name) ? { x, y, method, degree, name, steps, chart } : undefined;
  const lines = useMemo(() => (choice ? fitLines(choice) : []), [choice?.x, choice?.y, method, degree, name, steps, chart]);

  // The preview follows the choice after a short pause (the sheet is calculated with the lines).
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (lines.length === 0) return setHtml('');
    const timer = setTimeout(() => {
      try {
        setHtml(preview(lines));
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
    <Dialog title={say('fit.title')} catalog={catalog} wide onClose={onClose} onOk={() => choice && onInsert(lines)}>
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
          <label className="fit-name">
            <span>{say('fit.name')}</span>
            <input value={name} onChange={(e) => setOwnName(e.target.value.trim())} />
          </label>
          <label className={hasSteps(method) ? '' : 'disabled'}>
            <input type="checkbox" checked={steps && hasSteps(method)} disabled={!hasSteps(method)} onChange={(e) => setSteps(e.target.checked)} />
            {say('fit.steps')}
          </label>
          <label>
            <input type="checkbox" checked={chart} onChange={(e) => setChart(e.target.checked)} />
            {say('fit.chart')}
          </label>
          <p className="hint">{usable(method) ? say(`fit.tip.${method}` as UiKey) : say('fit.notHere')}</p>
          <pre className="fit-lines">{lines.join('\n')}</pre>
        </div>
        <div className="fit-preview page" aria-label={say('fit.preview')} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Dialog>
  );
}
