/**
 * The colours of text as a word processor offers them: automatic, the colours
 * of a theme with their lighter and darker shades, the standard ones, those
 * that stay readable in black-and-white print, the last ones used, and any
 * other from the system's colour dialog. Pressing a colour keeps the caret
 * and the marked words in the text.
 */

import { useEffect, useRef, useState } from 'react';
import { TEXT_COLORS } from '@kalketa/core';
import { textColorCss } from '@kalketa/render';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';

const THEME = ['#000000', '#ffffff', '#44546a', '#e7e6e6', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'];
const STANDARD = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const RECENT_KEY = 'kalketa.recentColors';

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
/** A shade of a colour: toward white (amount > 0) or toward black (amount < 0). */
function shade(color: string, amount: number): string {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return `#${rgb.map((c) => hex(amount > 0 ? c + (255 - c) * amount : c * (1 + amount))).join('')}`;
}
/** The theme as a word processor shows it: each colour, then three lighter and two darker shades. */
// White only darkens and black only lightens, step by step, as a word processor shows them.
const THEME_ROWS = [0, 1, 2, 3, 4, 5].map((row) =>
  THEME.map((c) => {
    if (row === 0) return c;
    if (c === '#ffffff') return shade(c, -[0.05, 0.15, 0.25, 0.35, 0.5][row - 1]!);
    if (c === '#000000') return shade(c, [0.5, 0.35, 0.25, 0.15, 0.05][row - 1]!);
    return shade(c, [0.8, 0.6, 0.4, -0.25, -0.5][row - 1]!);
  }),
);

function recent(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}
function remember(color: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([color, ...recent().filter((c) => c !== color)].slice(0, 10)));
  } catch {
    // Without storage the list of the last colours just stays empty.
  }
}

interface Props {
  readonly value: string | undefined;
  readonly catalog: Catalog;
  onPick(color: string | undefined): void;
  onClose(): void;
}

export function ColorPalette({ value, catalog, onPick, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLInputElement>(null);
  const [last] = useState(recent);
  const pick = (color: string | undefined) => {
    if (color) remember(color);
    onPick(color);
    onClose();
  };
  const keep = (e: { preventDefault(): void }) => e.preventDefault();
  const name = (color: string) => ((TEXT_COLORS as readonly string[]).includes(color) ? t(catalog, `textStyle.color.${color}` as UiKey) : color.toUpperCase());

  // Closed by a press anywhere else or by Esc.
  useEffect(() => {
    const away = (e: MouseEvent) => {
      // The button that opened it toggles it itself.
      if (!(box.current?.parentElement ?? box.current)?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', away, true);
      document.removeEventListener('keydown', key, true);
    };
  }, []);
  // The system's dialog gives its colour when it closes (not on every move inside it).
  useEffect(() => {
    const input = more.current;
    const done = () => input && pick(input.value);
    input?.addEventListener('change', done);
    return () => input?.removeEventListener('change', done);
  }, []);

  const swatch = (color: string) => (
    <button
      key={color}
      type="button"
      className={`swatch${value === color ? ' on' : ''}`}
      data-color={color}
      title={name(color)}
      style={{ background: textColorCss(color) }}
      onMouseDown={keep}
      onClick={() => pick(color)}
    />
  );
  return (
    <div className="color-palette" ref={box} data-color-palette="">
      <button type="button" className={`color-auto${value === undefined ? ' on' : ''}`} onMouseDown={keep} onClick={() => pick(undefined)}>
        <span className="swatch" style={{ background: '#000' }} /> {t(catalog, 'textProps.colorAuto')}
      </button>
      <div className="palette-title">{t(catalog, 'textProps.colorTheme')}</div>
      <div className="palette-grid">{THEME_ROWS.flatMap((row) => row.map(swatch))}</div>
      <div className="palette-title">{t(catalog, 'textProps.colorStandard')}</div>
      <div className="palette-grid">{STANDARD.map(swatch)}</div>
      <div className="palette-title">{t(catalog, 'textProps.colorPrint')}</div>
      <div className="palette-grid">{TEXT_COLORS.map(swatch)}</div>
      {last.length > 0 && (
        <>
          <div className="palette-title">{t(catalog, 'textProps.colorRecent')}</div>
          <div className="palette-grid">{last.map(swatch)}</div>
        </>
      )}
      <label className="color-more" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={more} type="color" defaultValue={value && value.startsWith('#') ? value : '#c00000'} />
        {t(catalog, 'textProps.colorMore')}
      </label>
    </div>
  );
}

/** A button with the colour now in use; it opens the palette under it. */
export function ColorButton({ value, catalog, onPick, open, onOpen }: { value: string | undefined; catalog: Catalog; onPick(color: string | undefined): void; open: boolean; onOpen(open: boolean): void }) {
  return (
    <span className="color-button-wrap">
      <button type="button" className="color-button" data-text-prop="color" title={t(catalog, 'textStyle.color')} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(!open)}>
        <span className="swatch" style={{ background: value ? textColorCss(value) : '#000' }} />
        <span>{value ? ((TEXT_COLORS as readonly string[]).includes(value) ? t(catalog, `textStyle.color.${value}` as UiKey) : value.toUpperCase()) : t(catalog, 'textProps.colorAuto')}</span>
        <span className="caret">▾</span>
      </button>
      {open && <ColorPalette value={value} catalog={catalog} onPick={onPick} onClose={() => onOpen(false)} />}
    </span>
  );
}
