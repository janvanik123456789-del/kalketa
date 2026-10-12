/**
 * The fonts of a canvas text in a select: the kinds first, then the fonts of
 * the system (each shown in itself); a font the text has but the list lacks
 * stays there, so choosing nothing changes nothing.
 */

import { TEXT_FONTS, type TextFont } from '../scene.js';
import type { CanvasTextKey } from './texts.js';

export function FontOptions({ fonts, current, text }: { fonts: readonly string[]; current: TextFont; text(key: CanvasTextKey): string }) {
  const label = (font: string) => (FONT_KEYS.has(font) ? text(`font.${font}` as CanvasTextKey) : font);
  const known = TEXT_FONTS.includes(current) || fonts.includes(current);
  return (
    <>
      {!known && <option value={current}>{label(current)}</option>}
      {TEXT_FONTS.map((f) => (
        <option key={f} value={f}>
          {label(f)}
        </option>
      ))}
      {fonts.length > 0 && (
        <optgroup label={text('systemFonts')}>
          {fonts.map((name) => (
            <option key={name} value={name} style={{ fontFamily: `"${name}"` }}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

const FONT_KEYS = new Set(['sans', 'serif', 'mono', 'arial', 'times', 'calibri', 'iso']);
