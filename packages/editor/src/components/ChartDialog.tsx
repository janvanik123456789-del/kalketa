/**
 * Insert > Chart…: the kind of chart (a curve, points or bars of data, the curve of a relation, a map with
 * contour lines, a surface in 3D), what of the sheet it draws, the ranges of its axes and a title; the chart
 * as it will print beside them, before its line is written into the sheet.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { fromDecimalComma, toDecimalComma } from '@kalketa/core';
import { CHART_KINDS, chartLine, firstChoice, firstKind, kindAvailable, kindNeeds, type ChartChoice, type ChartKind, type ChartRange, type ChartSources } from '../logic/chartInsert.js';
import { Dialog } from './Dialogs.js';

interface ChartDialogProps {
  readonly catalog: Catalog;
  readonly sources: ChartSources;
  /** Numbers written with a decimal comma (the language of the sheet). */
  readonly decimalComma: boolean;
  /** The chart of a line as it will print (HTML). */
  preview(line: string): string;
  onApply(line: string): void;
  onClose(): void;
}

export function ChartDialog({ catalog, sources, decimalComma, preview, onApply, onClose }: ChartDialogProps) {
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  const shown = (text: string) => (decimalComma ? toDecimalComma(text) : text);
  const written = (text: string) => (decimalComma ? fromDecimalComma(text) : text);
  // The ranges as the user writes them (decimal comma), in the dialog and as first offered.
  const typed = (c: ChartChoice): ChartChoice => ({ ...c, ranges: c.ranges.map((r) => ({ from: shown(r.from), to: shown(r.to) })) });
  const [choice, setChoice] = useState<ChartChoice>(() => typed(firstChoice(firstKind(sources), sources)));
  const set = (part: Partial<ChartChoice>) => setChoice((c) => ({ ...c, ...part }));
  // The ranges as typed (decimal comma as the user writes); the line takes them as the sheet reads them.
  const line = chartLine({ ...choice, ranges: choice.ranges.map((r) => ({ from: written(r.from), to: written(r.to) })) }, sources);
  const [html, setHtml] = useState('');
  useEffect(() => {
    // Drawn a moment after the last key, not at every one: a chart of a surface takes its time.
    const timer = setTimeout(() => setHtml(line ? preview(line) : ''), 250);
    return () => clearTimeout(timer);
  }, [line]);
  // The dialog takes the keys from the line being edited: Enter inserts the chart, not a new line in the sheet.
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    frame.current?.querySelector<HTMLInputElement>('input[name="chart-kind"]:checked')?.focus();
  }, []);
  const needs = kindNeeds(choice.kind);
  const own = useMemo(
    () =>
      needs === 'relation'
        ? sources.relations.map((r) => ({ name: r.name, label: `${r.name}: ${r.text}`, axes: r.axes, ranges: r.ranges }))
        : needs === 'series'
          ? []
          : sources.functions.filter((f) => f.params.length === (needs === 'function1' ? 1 : 2)).map((f) => ({ name: f.name, label: `${f.name}(${f.params.join('; ')})`, axes: f.params, ranges: f.ranges })),
    [needs, sources],
  );
  const picked = own.find((o) => o.name === choice.source);
  const pickKind = (kind: ChartKind) => {
    // From a map to a surface and back the function and its ranges stay.
    const same = kindNeeds(kind) === needs;
    setChoice(same ? { ...choice, kind } : { ...typed(firstChoice(kind, sources)), ...(choice.title ? { title: choice.title } : {}) });
  };
  const pickSource = (name: string) => {
    const next = own.find((o) => o.name === name);
    set({ source: name, ranges: next?.ranges.map((r) => ({ from: shown(r.from), to: shown(r.to) })) ?? [] });
  };
  const setRange = (i: number, part: Partial<ChartRange>) =>
    set({ ranges: Array.from({ length: Math.max(choice.ranges.length, i + 1) }, (_, k) => (k === i ? { ...(choice.ranges[k] ?? { from: '', to: '' }), ...part } : (choice.ranges[k] ?? { from: '', to: '' }))) });
  return (
    <Dialog title={say('chartDialog.title')} catalog={catalog} wide onClose={onClose} onOk={() => line && onApply(line)}>
      <div ref={frame} className="fit-dialog chart-dialog">
        <div className="fit-options">
          <fieldset>
            <legend>{say('chartDialog.kind')}</legend>
            {CHART_KINDS.map((kind) => {
              const available = kindAvailable(kind, sources);
              return (
                <label key={kind} className={available ? '' : 'disabled'} title={available ? say(`chartDialog.kind.${kind}.tip` as UiKey) : say(`chartDialog.missing.${kindNeeds(kind)}` as UiKey)}>
                  <input type="radio" name="chart-kind" data-kind={kind} checked={choice.kind === kind} disabled={!available} onChange={() => pickKind(kind)} />
                  {say(`chartDialog.kind.${kind}` as UiKey)}
                </label>
              );
            })}
          </fieldset>
          {needs === 'series' ? (
            <>
              <label className="fit-series">
                <span>{say('chartDialog.data')}</span>
                <select className="chart-data" value={choice.data ?? ''} onChange={(e) => set({ data: e.target.value })}>
                  {sources.series.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fit-series">
                <span>{say('chartDialog.dataX')}</span>
                <select className="chart-data-x" value={choice.dataX ?? ''} onChange={(e) => set({ dataX: e.target.value })}>
                  <option value="">{say('chartDialog.order')}</option>
                  {sources.series.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="fit-series">
              <span>{say(needs === 'relation' ? 'chartDialog.relation' : 'chartDialog.function')}</span>
              <select className="chart-source" value={choice.source ?? ''} onChange={(e) => pickSource(e.target.value)}>
                {own.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {choice.kind === 'curve' && own.length > 1 && (
            <fieldset>
              <legend>{say('chartDialog.more')}</legend>
              {own
                .filter((o) => o.name !== choice.source)
                .map((o) => (
                  <label key={o.name}>
                    <input type="checkbox" checked={(choice.more ?? []).includes(o.name)} onChange={(e) => set({ more: e.target.checked ? [...(choice.more ?? []), o.name] : (choice.more ?? []).filter((m) => m !== o.name) })} />
                    {o.label}
                  </label>
                ))}
            </fieldset>
          )}
          {picked &&
            picked.axes.map((axis, i) => (
              <label key={axis} className="fit-series chart-range">
                <span>{say('chartDialog.range', { axis })}</span>
                <input className="chart-from" value={choice.ranges[i]?.from ?? ''} aria-label={say('chartDialog.from', { axis })} onChange={(e) => setRange(i, { from: e.target.value })} />
                <span>..</span>
                <input className="chart-to" value={choice.ranges[i]?.to ?? ''} aria-label={say('chartDialog.to', { axis })} onChange={(e) => setRange(i, { to: e.target.value })} />
              </label>
            ))}
          {choice.kind === 'curve' && (
            <>
              <label>
                <input type="checkbox" checked={!!choice.roots} onChange={(e) => set({ roots: e.target.checked })} />
                {say('chart.roots')}
              </label>
              <label>
                <input type="checkbox" checked={!!choice.extremes} onChange={(e) => set({ extremes: e.target.checked })} />
                {say('chart.extremes')}
              </label>
            </>
          )}
          <label className="fit-name">
            <span>{say('chartDialog.chartTitle')}</span>
            <input value={choice.title ?? ''} placeholder={say('chartDialog.noTitle')} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <p className="hint">{say(`chartDialog.kind.${choice.kind}.tip` as UiKey)}</p>
          <pre className="fit-lines chart-line">{line ?? ''}</pre>
        </div>
        <div className="fit-preview page" aria-label={say('fit.preview')} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Dialog>
  );
}
