import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { segments } from '../src/logic/segments.js';

describe('segments of a sheet waiting to be calculated', () => {
  it('keeps every line a row of its own when a line above got longer', () => {
    const calculated = 'a := 1\nb := 2\nc := 3\nd := 4';
    const statements = evaluateSheet(calculated).sheet.statements;
    // The places of the statements count in the old text: read in the new one, they would reach over the next line.
    const changed = 'a := 1 + 2 + 3\nb := 2\nc := 3\nd := 4';
    expect(segments(changed, statements, undefined, calculated).map((s) => [s.start, s.end])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });

  it('keeps a statement over several lines together', () => {
    const calculated = 'a := (1 +\n  2)\nb := 2';
    const statements = evaluateSheet(calculated).sheet.statements;
    expect(segments('a := (1000 +\n  2)\nb := 2', statements, undefined, calculated).map((s) => [s.start, s.end])).toEqual([
      [1, 2],
      [3, 3],
    ]);
  });
});
