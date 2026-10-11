import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

const SHEET = [
  '## Stropní deska {pos}',
  'q := 5 kN/m',
  'L := 4 m',
  'A := q·L/2',
  '## Průvlak {pos}',
  "F := Pos1.A  ' reakce stropu",
  'L := 6 m',
  'A := F/2',
  '## Sloup {pos=7}',
  'N := Pos2.A + Pos1.A',
].join('\n');

describe('positions of a calculation', () => {
  it('give each position its own names, read in the next ones as Pos1.A', () => {
    const r = evaluateSheet(SHEET);
    expect(r.diagnostics).toEqual([]);
    expect(r.statements.map((s) => s.position).filter(Boolean)).toEqual(['1', '2', '7']);
    expect(r.statements[7]!.display).toMatchObject({ value: 5, unit: 'kN' });
    expect(r.statements[9]!.display).toMatchObject({ value: 15, unit: 'kN' });
  });

  it('end the names of a position with it; the last one keeps them for the sheet', () => {
    expect(evaluateSheet(`${SHEET}\nx := A`).diagnostics.map((d) => d.code)).toEqual(['E-UNDEFINED']);
    const r = evaluateSheet(SHEET);
    expect(r.values.get('N')).toMatchObject({ si: 15000 });
    expect(r.values.has('q')).toBe(false);
    expect(r.values.get('Pos1')).toMatchObject({ type: 'record', position: '1' });
  });

  it('number on from a number given; a label like 3a stays as it is', () => {
    const r = evaluateSheet('# A {pos=3}\n# B {pos}\n# C {pos=4a}\n# D {pos}');
    expect(r.statements.map((s) => s.position)).toEqual(['3', '4', '4a', '5']);
  });
});
