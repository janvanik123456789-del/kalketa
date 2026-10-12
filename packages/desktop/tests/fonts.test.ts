import { describe, expect, it } from 'vitest';
import { familiesOfFontconfig, familiesOfRegistry } from '../src/fonts.js';

describe('the fonts of the system', () => {
  it('reads the families from the registry of Windows, without their styles', () => {
    const listing = [
      'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
      '    Arial (TrueType)    REG_SZ    arial.ttf',
      '    Arial Bold Italic (TrueType)    REG_SZ    arialbi.ttf',
      '    Arial Narrow (TrueType)    REG_SZ    ARIALN.TTF',
      '    Cambria & Cambria Math (TrueType)    REG_SZ    cambria.ttc',
    ].join('\r\n');
    expect(familiesOfRegistry(listing)).toEqual(['Arial', 'Arial', 'Arial Narrow', 'Cambria', 'Cambria Math']);
  });

  it('reads the families of fontconfig', () => {
    expect(familiesOfFontconfig('DejaVu Sans,DejaVu Sans Condensed\nLiberation Serif\n')).toEqual(['DejaVu Sans', 'DejaVu Sans Condensed', 'Liberation Serif']);
  });
});
