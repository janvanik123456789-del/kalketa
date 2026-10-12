/**
 * The fonts a person can choose for text: those installed in the operating
 * system (read by the desktop application), else a list most machines have.
 * In the language a name is written with _ for a space (font=Times_New_Roman).
 */

import { useEffect, useState } from 'react';
import { desktop } from '../document.js';

const COMMON = ['Arial', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Courier New', 'Georgia', 'ISOCPEUR', 'osifont', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

let fonts: Promise<readonly string[]> | undefined;

/** The names the language can write: letters, digits, spaces and hyphens. */
const WRITABLE = /^[\p{L}\p{N} -]+$/u;

export function systemFonts(): Promise<readonly string[]> {
  fonts ??= (desktop?.systemFonts?.() ?? Promise.resolve(COMMON))
    .then((list) => (list.length > 0 ? list : COMMON).filter((name) => WRITABLE.test(name)))
    .catch(() => COMMON);
  return fonts;
}

export function useSystemFonts(): readonly string[] {
  const [list, setList] = useState<readonly string[]>([]);
  useEffect(() => {
    let live = true;
    void systemFonts().then((found) => live && setList(found));
    return () => {
      live = false;
    };
  }, []);
  return list;
}

/** A font's name as the language writes it, and back. */
export const fontValue = (family: string) => family.replace(/ /g, '_');
export const fontName = (value: string) => value.replace(/_/g, ' ');
