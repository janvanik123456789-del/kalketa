import { describe, expect, it } from 'vitest';
import { builtinFunctions, DIAGNOSTIC_SEVERITY, diagnostic, evaluateSheet, FUNCTION_MODULES, type DiagnosticCode } from '@kalketa/core';
import { CATALOGS, catalogFor, formatDiagnostic, formatNumber, formatUtilization, formatValue } from '../src/index.js';

const span = { offset: 0, length: 1, line: 1, column: 1 };

describe('catalogs', () => {
  it('have a message for every diagnostic code', () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const code of Object.keys(DIAGNOSTIC_SEVERITY) as DiagnosticCode[]) {
        expect(catalog.diagnostics[code], `${catalog.locale}: ${code}`).toBeTruthy();
      }
    }
  });

  it('pick a catalog by language and fall back to English', () => {
    expect(catalogFor('cs-CZ').locale).toBe('cs');
    expect(catalogFor('xx').locale).toBe('en');
  });
});

describe('formatDiagnostic', () => {
  it('fills in parameters and translates terms', () => {
    const d = diagnostic('E-SYNTAX', span, { expected: 'value', found: 'end-of-line' });
    expect(formatDiagnostic(d, catalogFor('cs'))).toBe('Očekáváno: hodnota; nalezeno: konec řádku.');
    expect(formatDiagnostic(d, catalogFor('en'))).toBe('Expected a value, found end of line.');
  });

  it('formats a real diagnostic from the core', () => {
    const d = evaluateSheet('6 m + 2 s').diagnostics[0]!;
    expect(formatDiagnostic(d, catalogFor('cs'))).toBe('Nesouhlasí jednotky pro „+“: m a s.');
  });
});

describe('formatNumber', () => {
  it('uses the locale decimal separator', () => {
    expect(formatNumber(601.92, catalogFor('en'))).toBe('601.9');
    expect(formatNumber(601.92, catalogFor('cs'))).toBe('601,9');
  });

  it('switches to scientific notation for extreme magnitudes', () => {
    expect(formatNumber(1.602e-19, catalogFor('en'))).toBe('1.602E-19');
    expect(formatNumber(0, catalogFor('en'))).toBe('0');
  });

  it('writes a year or a count of four digits without a space, a number with a unit grouped', () => {
    const cs = catalogFor('cs');
    expect(formatValue(2030, undefined, '', cs)).toBe('2030');
    expect(formatValue(12450, undefined, '', cs)).toBe('12 450');
    expect(formatValue(2030, undefined, 'mm', cs)).toBe('2 030 mm');
  });

  it('rounds the number as written on paper, not its binary neighbour (F4 of the samples)', () => {
    // 120 000·1.025³ = 129 226.875 exactly; in binary 129 226.87499…
    expect(formatNumber(120000 * 1.025 ** 3, catalogFor('cs'), { decimals: 2 })).toBe('129 226,88');
    expect(formatNumber(1.005, catalogFor('en'), { decimals: 2 })).toBe('1.01');
  });

  it('keeps the places asked of a large number while the digits a calculation holds suffice', () => {
    const cs = catalogFor('cs');
    const plain = (text: string) => text.replace(/ /g, ' ');
    expect(plain(formatNumber(1234567890.5, cs, { decimals: 2 }))).toBe('1 234 567 890,50');
    expect(plain(formatNumber(2.5e7, cs, { decimals: 0 }))).toBe('25 000 000');
    expect(plain(formatNumber(13983816, cs, { decimals: 8 }))).toBe('13 983 816,00000000');
    // More than 15 digits would be invented: an exponent with all those held.
    expect(plain(formatNumber(2 * Math.PI * 1e12, cs, { decimals: 4 }))).toBe('6,28318530717959E12');
    // A whole number known exactly: every digit.
    expect(plain(formatNumber(2432902008176640000, cs, { decimals: 0, exactWhole: 2432902008176640000n }))).toBe('2 432 902 008 176 640 000');
    expect(plain(formatNumber(25852016738884976640000, cs, { decimals: 0, exactWhole: 25852016738884976640000n }))).toBe('25 852 016 738 884 976 640 000');
  });
});

describe('utilization of a check', () => {
  it('agrees with the verdict: a failed check is never shown at 100 %', () => {
    const cs = catalogFor('cs');
    const plain = (text: string) => text.replace(/ /g, ' ');
    expect(plain(formatUtilization(1.0004, false, cs))).toBe('100,04 %');
    expect(plain(formatUtilization(1 + 1e-6, false, cs))).toBe('100,0001 %');
    expect(plain(formatUtilization(1 + 1e-12, false, cs))).toBe('> 100 %');
    expect(plain(formatUtilization(1.0004, true, cs))).toBe('100 %');
    expect(plain(formatUtilization(0.9, false, cs))).toBe('90 %');
  });
});

describe('function help', () => {
  it('describes every built-in function and module in every language', () => {
    for (const catalog of Object.values(CATALOGS)) {
      for (const def of builtinFunctions.all()) expect(catalog.functions[def.name], `${catalog.locale}: ${def.name}`).toBeTruthy();
      for (const def of builtinFunctions.all()) expect(catalog.functionDetails[def.name], `${catalog.locale} details: ${def.name}`).toBeTruthy();
      // No help of a function that is not there (a renamed or removed one).
      expect(Object.keys(catalog.functionDetails).filter((name) => !builtinFunctions.has(name))).toEqual([]);
      for (const module of FUNCTION_MODULES) expect(catalog.functionModules[module], `${catalog.locale}: ${module}`).toBeTruthy();
    }
  });
});

describe('a zero', () => {
  it('is never negative: −0 prints as 0', () => {
    const cs = catalogFor('cs');
    expect(formatNumber(-0, cs)).toBe('0');
    expect(formatNumber(-0.4, cs)).toBe('-0,4');
  });
});
