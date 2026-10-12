/**
 * The properties of the line of text being edited, as the side pane of a word
 * processor shows them: Character (font, size, bold, italic, color) and
 * Paragraph (style, alignment). Pressing a button keeps the caret in the text.
 */

import type { ReactNode } from 'react';
import { TEXT_ALIGNS, TEXT_COLORS } from '@kalketa/core';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import type { TextFormat } from './TextRowEditor.js';

export const TEXT_SIZES = ['9', '10', '11', '12', '14', '16', '20'] as const;
export const TEXT_FONT_KINDS = ['serif', 'sans', 'mono'] as const;

/** Lines of a paragraph set to the left, the middle, the right or both edges. */
function AlignIcon({ align }: { align: string }) {
  const widths = [14, 9, 12, 7];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      {widths.map((w, i) => {
        const width = align === 'justify' ? 14 : w;
        const x = align === 'center' ? 1 + (14 - width) / 2 : align === 'right' ? 15 - width : 1;
        return <rect key={i} x={x} y={1.5 + i * 3.2} width={width} height="1.4" rx="0.7" fill="currentColor" />;
      })}
    </svg>
  );
}

export function TextProperties({ format, catalog }: { format: TextFormat; catalog: Catalog }) {
  const value = (key: string) => format.attributes.get(key) ?? '';
  const keep = (e: { preventDefault(): void }) => e.preventDefault();
  const button = (props: { id: string; title: string; on: boolean; run(): void; children: ReactNode }) => (
    <button type="button" className={`text-prop-button${props.on ? ' on' : ''}`} data-text-prop={props.id} title={props.title} aria-pressed={props.on} onMouseDown={keep} onClick={props.run}>
      {props.children}
    </button>
  );
  const select = (key: string, label: string, options: readonly (readonly [string, string])[]) => (
    <label className="text-prop">
      <span>{label}</span>
      <select data-text-prop={key} value={value(key)} onChange={(e) => format.set(key, e.target.value || undefined)}>
        <option value="">{t(catalog, 'textStyle.defaultValue')}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="text-properties" data-text-properties="">
      <h3>{t(catalog, 'textProps.character')}</h3>
      {select('font', t(catalog, 'textStyle.font'), TEXT_FONT_KINDS.map((f) => [f, t(catalog, `textStyle.font.${f}` as UiKey)]))}
      {select('size', t(catalog, 'textStyle.size'), TEXT_SIZES.map((s) => [s, `${s} pt`]))}
      <div className="text-prop-row">
        {button({ id: 'bold', title: `${t(catalog, 'textStyle.bold')} (Ctrl+B)`, on: format.bold, run: format.toggleBold, children: <b>B</b> })}
        {button({ id: 'italic', title: `${t(catalog, 'textStyle.italic')} (Ctrl+I)`, on: format.italic, run: format.toggleItalic, children: <i>I</i> })}
      </div>
      {select('color', t(catalog, 'textStyle.color'), TEXT_COLORS.map((c) => [c, t(catalog, `textStyle.color.${c}` as UiKey)]))}
      <h3>{t(catalog, 'textProps.paragraph')}</h3>
      <label className="text-prop">
        <span>{t(catalog, 'textProps.style')}</span>
        <select data-text-prop="level" value={String(format.level)} onChange={(e) => format.setLevel(Number(e.target.value))}>
          {[0, 1, 2, 3].map((level) => (
            <option key={level} value={level}>
              {t(catalog, `textProps.level${level}` as UiKey)}
            </option>
          ))}
        </select>
      </label>
      <div className="text-prop-row">
        {TEXT_ALIGNS.map((align) =>
          button({
            id: `align-${align}`,
            title: `${t(catalog, 'textStyle.align')}: ${t(catalog, `textStyle.align.${align}` as UiKey)}`,
            on: (format.attributes.get('align') ?? 'left') === align,
            run: () => format.set('align', align === 'left' ? undefined : align),
            children: <AlignIcon align={align} />,
          }),
        )}
      </div>
      <button type="button" className="text-prop-raw" data-text-prop="raw" onMouseDown={keep} onClick={format.raw}>
        {t(catalog, 'textProps.raw')}
      </button>
    </div>
  );
}
