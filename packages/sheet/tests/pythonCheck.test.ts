import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { compareWithSheet, readOutput, RESULT_MARK } from '../src/pythonCheck.js';

describe('a calculation checked in Python', () => {
  it('takes the results out of the output and keeps the rest of it', () => {
    const out = `start\n${RESULT_MARK}{"name": "v_A", "value": 13.288, "unit": "m/s", "rel": 1e-4}\n${RESULT_MARK}not json\nend\n`;
    const read = readOutput(out);
    expect(read.results).toEqual([{ name: 'v_A', value: 13.288, unit: 'm/s', rel: 1e-4 }]);
    expect(read.output).toBe(`start\n${RESULT_MARK}not json\nend`);
  });

  it('sets each result beside the sheet in the unit Python used: agree, differ, missing, other units', () => {
    const sheet = evaluateSheet('v := 10 m/s\nT := 37 °C\nF := 2 kN\nsolve x: x^2 == 4 in 0 .. 5');
    const rows = compareWithSheet(
      [
        { name: 'v', value: 36, unit: 'km/h', rel: 1e-9 },
        { name: 'T', value: 310.15, unit: 'K', rel: 1e-9 },
        { name: 'F', value: 2001, unit: 'N', rel: 1e-6 },
        { name: 'x', value: 2, unit: '', rel: 1e-9 },
        { name: 'm', value: 1, unit: 'kg', rel: 1e-6 },
        { name: 'v', value: 10, unit: 'kg', rel: 1e-6 },
        { name: 'v', value: 10, unit: 'furlong', rel: 1e-6 },
      ],
      sheet,
    );
    expect(rows.map((r) => r.state)).toEqual(['agree', 'agree', 'differ', 'agree', 'missing', 'units', 'unit']);
    expect(rows[0]!.kalketa).toEqual({ value: 36, unit: 'km/h' });
    const area = compareWithSheet([{ name: 'S', value: 2, unit: 'm^2', rel: 1e-9 }], evaluateSheet('S := 2 m^2'));
    expect(area[0]).toMatchObject({ state: 'agree', python: { value: 2, unit: 'm²' }, kalketa: { unit: 'm²' } });
    expect(rows[2]!.difference).toBeCloseTo(0.0005, 6);
  });
});
