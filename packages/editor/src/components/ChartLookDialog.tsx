/**
 * Format > the look of a chart (from its right button): colours of the curves, their width and dashes,
 * marks of points, grid, frame, size of text, legend; the chart as it will print beside them.
 * Applied to this chart only (plot(…, style: "…") keeps what differs from the style of the calculation),
 * or saved as the style of charts of the calculation, which every chart of it takes.
 */

import { useMemo, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { CHART_PALETTES, chartSvg, SERIES_COLORS, withLook, type ChartLook, type ChartSpec } from '@kalketa/chart';
import { Dialog } from './Dialogs.js';

interface ChartLookDialogProps {
  readonly catalog: Catalog;
  /** The chart: what it shows and its size. */
  readonly spec: ChartSpec;
  readonly size: { readonly width: number; readonly height: number };
  /** Numbers of its ticks as the print writes them. */
  format(value: number): string;
  /** The style of charts of the calculation, and the chart's own look over it. */
  readonly base: ChartLook;
  readonly own: ChartLook;
  /** This chart only: its own look (all of it; the caller keeps what differs from the style). */
  onApply(look: ChartLook): void;
  /** The style of charts of the calculation: every chart of it takes the look. */
  onSaveStyle(look: ChartLook): void;
  onClose(): void;
}

const LINES = [1, 1.5, 2, 2.5, 3, 4];
const FONTS = [9, 10, 11, 12, 13, 14];

export function ChartLookDialog({ catalog, spec, size, format, base, own, onApply, onSaveStyle, onClose }: ChartLookDialogProps) {
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  const [look, setLook] = useState<ChartLook>(withLook(base, own));
  const set = (part: ChartLook) => setLook((l) => ({ ...l, ...part }));
  // As many colours as the chart has curves (at least one, at most eight).
  const count = Math.min(8, Math.max(1, spec.series.length));
  const colors = look.colors ?? SERIES_COLORS;
  const palette = Object.entries(CHART_PALETTES).find(([, p]) => p.slice(0, count).join() === colors.slice(0, count).join())?.[0] ?? 'own';
  const svg = useMemo(() => chartSvg(spec, { ...size, format, look }), [spec, size, format, look]);
  const choose = <T extends string | number>(label: UiKey, value: T, values: readonly T[], text: (v: T) => string, pick: (v: T) => void) => (
    <label className="look-field">
      <span>{say(label)}</span>
      <select value={String(value)} onChange={(e) => pick(values.find((v) => String(v) === e.target.value)!)}>
        {values.map((v) => (
          <option key={String(v)} value={String(v)}>
            {text(v)}
          </option>
        ))}
      </select>
    </label>
  );
  const check = (label: UiKey, value: boolean, pick: (v: boolean) => void) => (
    <label className="look-check">
      <input type="checkbox" checked={value} onChange={(e) => pick(e.target.checked)} />
      {say(label)}
    </label>
  );
  return (
    <Dialog
      title={say('look.title')}
      catalog={catalog}
      wide
      onClose={onClose}
      buttons={[
        { label: say('look.apply'), run: () => onApply(look), isDefault: true },
        { label: say('look.saveStyle'), run: () => onSaveStyle(look) },
        { label: say('dlg.cancel'), run: onClose },
      ]}
    >
      <div className="look-dialog">
        <div className="look-options">
          <fieldset>
            <legend>{say('look.curves')}</legend>
            {choose('look.palette', palette, [...Object.keys(CHART_PALETTES), ...(palette === 'own' ? ['own'] : [])], (p) => say(`look.palette.${p}` as UiKey), (p) => p !== 'own' && set({ colors: CHART_PALETTES[p]! }))}
            <div className="look-colors">
              {colors.slice(0, count).map((c, i) => (
                <input
                  key={i}
                  type="color"
                  value={c}
                  aria-label={say('look.color', { n: i + 1 })}
                  title={spec.series[i]?.label ?? ''}
                  onChange={(e) => set({ colors: colors.map((o, j) => (j === i ? e.target.value : o)) })}
                />
              ))}
            </div>
            {choose('look.line', look.line ?? 2, LINES, (v) => `${String(v).replace('.', ',')} px`, (line) => set({ line }))}
            {check('look.dashes', look.dashes ?? true, (dashes) => set({ dashes }))}
            {choose('look.markers', look.markers ?? 'auto', ['auto', 'always', 'never'] as const, (v) => say(`look.markers.${v}`), (markers) => set({ markers }))}
          </fieldset>
          <fieldset>
            <legend>{say('look.frameAndText')}</legend>
            {choose('look.grid', look.grid ?? 'both', ['both', 'y', 'x', 'none'] as const, (v) => say(`look.grid.${v}`), (grid) => set({ grid }))}
            {check('look.frame', look.frame ?? false, (frame) => set({ frame }))}
            {choose('look.font', look.font ?? 11, FONTS, (v) => `${v} px`, (font) => set({ font }))}
            {check('look.legend', (look.legend ?? 'top') === 'top', (on) => set({ legend: on ? 'top' : 'none' }))}
            {check('look.names', look.names ?? true, (names) => set({ names }))}
          </fieldset>
          <button type="button" className="look-reset" onClick={() => setLook({})}>
            {say('look.reset')}
          </button>
          <p className="hint">{say('look.hint')}</p>
        </div>
        <div className="look-preview page" aria-label={say('look.preview')} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </Dialog>
  );
}
