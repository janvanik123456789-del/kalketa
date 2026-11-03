/**
 * The small window beside a part of a chart: a click on a title, the numbers of an axis, a curve or the legend
 * opens it with what that part has, no more. A change shows at once in the chart and is kept in its line
 * (plot(…, style: "…")); nothing to confirm, Esc or a click elsewhere closes it, Ctrl+Z takes a change back.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import type { ChartLook, ChartSpec } from '@kalketa/chart';
import { lookOption, partKind, type ChartPart } from './logic/chartParts.js';

interface ChartPartPanelProps {
  readonly catalog: Catalog;
  /** The fonts to choose from. */
  readonly fonts: readonly string[];
  readonly part: ChartPart;
  readonly spec: ChartSpec;
  /** The look of the chart as the user sees it, and the part of it this chart keeps itself. */
  readonly look: ChartLook;
  /** The element clicked: the window stands beside it. */
  anchor(): Element | null;
  /** Sets (or with undefined takes away) properties of the part. */
  onSet(changes: Readonly<Record<string, string | undefined>>): void;
  /** Changes the look of the whole chart: grid, frame, legend, names, markers. */
  onLook(change: Partial<ChartLook>): void;
  /** The words of an axis title, in the line beside the look. */
  onTitle?(text: string): void;
  onReset(): void;
  onClose(): void;
}

/** A font's name as the line writes it, and back. */
const fontValue = (family: string) => family.replace(/ /g, '_');
const fontName = (value: string) => value.replace(/_/g, ' ');

const SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const WIDTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
const DASHES = ['solid', 'dash', 'dot', 'dashdot'] as const;

export function ChartPartPanel({ catalog, fonts, part, spec, look, anchor, onSet, onLook, onTitle, onReset, onClose }: ChartPartPanelProps) {
  const say = (key: UiKey, params?: Record<string, string | number>) => t(catalog, key, params);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number }>();
  const kind = partKind(part);
  const get = (name: string) => look.parts?.[`${part}.${name}`];

  // Beside the whole chart where there is room, so that it does not cover what it changes; else beside the element.
  // Inside the window, and follows the chart when it is drawn anew.
  useLayoutEffect(() => {
    const element = anchor();
    const own = box.current?.getBoundingClientRect();
    if (!own) return;
    const at = element?.getBoundingClientRect() ?? { left: 40, right: 40, top: 40, bottom: 40 };
    const chart = element?.closest('svg')?.getBoundingClientRect() ?? at;
    const room = window.innerWidth - own.width - 8;
    const left =
      chart.right + 12 <= room ? chart.right + 12 : chart.left - own.width - 12 >= 8 ? chart.left - own.width - 12 : at.right + 12 <= room ? at.right + 12 : Math.max(8, at.left - own.width - 12);
    const top = Math.min(window.innerHeight - own.height - 8, Math.max(8, at.top));
    setPlace((now) => (now && now.left === left && now.top === top ? now : { left, top }));
  });

  // Esc or a press elsewhere closes it (a press on another part opens that one instead).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const press = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!box.current?.contains(target) && !target.closest?.('[data-part]')) onClose();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', press, true);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', press, true);
    };
  }, [onClose]);

  const field = (label: UiKey, control: ReactNode) => (
    <label className="part-field">
      <span>{say(label)}</span>
      {control}
    </label>
  );
  const color = (name: string, usual: string, label: UiKey = 'part.color') => field(label, <input type="color" data-part-field={name} value={get(name) ?? usual} onChange={(e) => onSet({ [name]: e.target.value })} />);
  const width = (usual: number) =>
    field(
      'part.width',
      <select data-part-field="width" value={get('width') ?? String(usual)} onChange={(e) => onSet({ width: e.target.value })}>
        {[...new Set([...WIDTHS, Number(get('width') ?? usual)])].sort((a, b) => a - b).map((v) => (
          <option key={v} value={v}>
            {String(v).replace('.', catalog.locale.startsWith('cs') ? ',' : '.')} px
          </option>
        ))}
      </select>,
    );
  const dash = () =>
    field(
      'part.dash',
      <select data-part-field="dash" value={get('dash') ?? ''} onChange={(e) => onSet({ dash: e.target.value || undefined })}>
        <option value="">{say('part.dash.usual')}</option>
        {DASHES.map((d) => (
          <option key={d} value={d}>
            {say(`part.dash.${d}` as UiKey)}
          </option>
        ))}
      </select>,
    );
  const toggle = (label: UiKey, name: string, content: string) => (
    <button type="button" className={get(name) ? 'on' : ''} data-part-field={name} title={say(label)} aria-pressed={!!get(name)} onClick={() => onSet({ [name]: get(name) ? undefined : 'on' })}>
      {content}
    </button>
  );
  const textFields = () => {
    const font = get('font') ?? '';
    const size = Number(get('size')) || (look.font ?? 11);
    return (
      <>
        {field(
          'part.font',
          <select data-part-field="font" value={font} onChange={(e) => onSet({ font: e.target.value || undefined })}>
            <option value="">{say('part.font.usual')}</option>
            {font && !fonts.includes(fontName(font)) && <option value={font}>{fontName(font)}</option>}
            {fonts.map((name) => (
              <option key={name} value={fontValue(name)} style={{ fontFamily: `"${name}"` }}>
                {name}
              </option>
            ))}
          </select>,
        )}
        {field(
          'part.size',
          <select data-part-field="size" value={size} onChange={(e) => onSet({ size: e.target.value })}>
            {[...new Set([...SIZES, size])].sort((a, b) => a - b).map((v) => (
              <option key={v} value={v}>
                {v} px
              </option>
            ))}
          </select>,
        )}
        <div className="part-row">
          {toggle('part.bold', 'bold', 'B')}
          {toggle('part.italic', 'italic', 'I')}
          <input type="color" data-part-field="color" aria-label={say('part.color')} title={say('part.color')} value={get('color') ?? '#333333'} onChange={(e) => onSet({ color: e.target.value })} />
        </div>
      </>
    );
  };

  const title = spec.series.length > 0 && kind === 'curve' ? say('part.curve', { name: spec.series[Number(part.slice(1))]?.label ?? '' }) : say(`part.${part}` as UiKey);
  const series = kind === 'curve' ? spec.series[Number(part.slice(1))] : undefined;
  return createPortal(
    <div
      ref={box}
      className="chart-part-panel"
      role="dialog"
      aria-label={title}
      data-chart-part-panel={part}
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="part-head">
        <strong>{title}</strong>
        <button type="button" className="part-close" aria-label={say('part.close')} title={say('part.close')} onClick={onClose}>
          ×
        </button>
      </div>
      {(part === 'xTitle' || part === 'yTitle') && onTitle && field('part.text', <TitleInput value={(part === 'xTitle' ? spec.xTitle : spec.yTitle).replace(/\s*\[[^\]]*\]$/, '')} onChange={onTitle} />)}
      {kind === 'text' && textFields()}
      {part === 'yTitle' && (
        <div className="part-row part-choice">
          <button type="button" className={get('rotate') ? '' : 'on'} data-part-field="horizontal" onClick={() => onSet({ rotate: undefined, at: undefined })}>
            {say('part.horizontal')}
          </button>
          <button type="button" className={get('rotate') ? 'on' : ''} data-part-field="vertical" onClick={() => onSet({ rotate: '90', at: undefined })}>
            {say('part.vertical')}
          </button>
        </div>
      )}
      {part === 'legend' && (
        <label className="part-check">
          <input type="checkbox" data-part-field="show" checked={(look.legend ?? 'top') === 'top'} onChange={(e) => onLook({ legend: e.target.checked ? 'top' : 'none' })} />
          {say('part.show')}
        </label>
      )}
      {part === 'names' && (
        <label className="part-check">
          <input type="checkbox" data-part-field="show" checked={look.names ?? true} onChange={(e) => onLook({ names: e.target.checked })} />
          {say('part.show')}
        </label>
      )}
      {part === 'axis' && (
        <>
          {color('color', '#6b7280')}
          {width(1)}
        </>
      )}
      {part === 'grid' && (
        <>
          {field(
            'part.gridKind',
            <select data-part-field="gridKind" value={look.grid ?? 'both'} onChange={(e) => onLook({ grid: e.target.value as NonNullable<ChartLook['grid']> })}>
              {(['both', 'y', 'x', 'none'] as const).map((g) => (
                <option key={g} value={g}>
                  {say(`look.grid.${g}`)}
                </option>
              ))}
            </select>,
          )}
          {color('color', '#e5e7eb')}
          {width(1)}
          {dash()}
          <label className="part-field">
            <span>{say('part.fill')}</span>
            <input type="color" data-part-field="fill" value={look.parts?.['plot.fill'] ?? '#ffffff'} onChange={(e) => onLook({ parts: { ...look.parts, 'plot.fill': e.target.value } })} />
          </label>
          <label className="part-check">
            <input type="checkbox" data-part-field="frame" checked={look.frame ?? false} onChange={(e) => onLook({ frame: e.target.checked })} />
            {say('look.frame')}
          </label>
        </>
      )}
      {kind === 'curve' && series && (
        <>
          {field('part.name', <TitleInput value={get('name')?.replace(/~/g, ' ') ?? series.label} onChange={(text) => onSet({ name: text.trim() && text.trim() !== series.label ? text.trim().replace(/\s+/g, '~') : undefined })} />)}
          {color('color', lookOption(look, spec, part))}
          {width(look.line ?? 2)}
          {dash()}
          {field(
            'part.markers',
            <select data-part-field="markers" value={look.markers ?? 'auto'} onChange={(e) => onLook({ markers: e.target.value as NonNullable<ChartLook['markers']> })}>
              {(['auto', 'always', 'never'] as const).map((m) => (
                <option key={m} value={m}>
                  {say(`look.markers.${m}`)}
                </option>
              ))}
            </select>,
          )}
          {field(
            'part.markerSize',
            <select data-part-field="marker" value={get('marker') ?? '3'} onChange={(e) => onSet({ marker: e.target.value })}>
              {[2, 3, 4, 5, 6, 8].map((v) => (
                <option key={v} value={v}>
                  {v} px
                </option>
              ))}
            </select>,
          )}
        </>
      )}
      {(part === 'xTitle' || part === 'yTitle' || part === 'legend') && <p className="part-hint">{say('part.dragHint')}</p>}
      <button type="button" className="part-reset" data-part-field="reset" onClick={onReset}>
        {say('part.reset')}
      </button>
    </div>,
    document.body,
  );
}

/** Words written into the chart as they are typed, not on every redraw taken back from it. */
function TitleInput({ value, onChange }: { value: string; onChange(text: string): void }) {
  const [text, setText] = useState(value);
  return (
    <input
      type="text"
      data-part-field="text"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
