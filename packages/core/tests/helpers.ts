import { expect } from 'vitest';
import { evaluateSheet, type SheetResult } from '../src/index.js';

/** Evaluates a sheet and returns the displayed value of the last statement. */
export function last(source: string): { value: number; unit: string; result: SheetResult } {
  const result = evaluateSheet(source);
  const lastResult = result.statements[result.statements.length - 1];
  expect(lastResult?.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(lastResult?.display, `no display value for: ${source}`).toBeDefined();
  return { ...lastResult!.display!, result };
}

/** Diagnostic codes of the whole sheet. */
export function codes(source: string): string[] {
  return evaluateSheet(source).diagnostics.map((d) => d.code);
}

export function expectValue(source: string, value: number, unit: string, digits = 9): void {
  const shown = last(source);
  expect(shown.unit).toBe(unit);
  expect(shown.value).toBeCloseTo(value, digits);
}
