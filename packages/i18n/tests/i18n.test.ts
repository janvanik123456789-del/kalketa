import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_SEVERITY, diagnostic, evaluateSheet, type DiagnosticCode } from '@calccanvas/core';
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
});
