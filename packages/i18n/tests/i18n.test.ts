import { describe, expect, it } from 'vitest';
import { builtinFunctions, DIAGNOSTIC_SEVERITY, diagnostic, evaluateSheet, FUNCTION_MODULES, type DiagnosticCode } from '@kalketa/core';
import { CATALOGS, catalogFor, formatDiagnostic, formatNumber } from '../src/index.js';

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

  it('rounds the number as written on paper, not its binary neighbour (F4 of the samples)', () => {
    // 120 000·1.025³ = 129 226.875 exactly; in binary 129 226.87499…
    expect(formatNumber(120000 * 1.025 ** 3, catalogFor('cs'), { decimals: 2 })).toBe('129 226,88');
    expect(formatNumber(1.005, catalogFor('en'), { decimals: 2 })).toBe('1.01');
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
