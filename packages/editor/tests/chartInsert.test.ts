import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '@kalketa/core';
import { chartLine, firstChoice, firstKind, kindAvailable, type ChartSources } from '../src/logic/chartInsert.js';

const sources: ChartSources = {
  functions: [
    { name: 'M', params: ['x'], ranges: [{ from: '0 m', to: 'L' }] },
    { name: 'V', params: ['x'], ranges: [{ from: '0 m', to: 'L' }] },
    { name: 'w', params: ['x', 'y'], ranges: [{ from: '0 m', to: 'a' }, { from: '0 m', to: 'b' }] },
  ],
  relations: [{ name: 'Kruh', text: 'x^2 + y^2 == r^2', axes: ['x', 'y'], ranges: [{ from: '-1.5·r', to: '1.5·r' }, { from: '-1.5·r', to: '1.5·r' }] }],
  series: ['Body.x', 'Body.y'],
};

describe('Insert > Chart', () => {
  it('writes the plot line of each kind', () => {
    expect(chartLine({ kind: 'curve', source: 'M', more: ['V'], ranges: [{ from: '0 m', to: 'L' }], roots: true }, sources)).toBe('plot(M(x), V(x), x: 0 m .. L, roots: true)');
    expect(chartLine({ kind: 'map', source: 'w', ranges: [{ from: '0 m', to: 'a' }, { from: '0 m', to: 'b' }] }, sources)).toBe('plot(w(x, y), x: 0 m .. a, y: 0 m .. b)');
    expect(chartLine({ kind: 'surface', source: 'w', ranges: [{ from: '0 m', to: 'a' }, { from: '0 m', to: 'b' }], title: 'Průhyb "desky"' }, sources)).toBe('plot(w(x, y), x: 0 m .. a, y: 0 m .. b, kind: "surface", title: "Průhyb \'desky\'")');
    expect(chartLine({ kind: 'implicit', source: 'Kruh', ranges: [{ from: '-1.5·r', to: '1.5·r' }, { from: '-2', to: '2' }] }, sources)).toBe('plot(Kruh, x: -1.5·r .. 1.5·r, y: -2 .. 2)');
    expect(chartLine({ kind: 'points', data: 'Body.y', dataX: 'Body.x', ranges: [] }, sources)).toBe('plot(Body.y, x: Body.x, kind: "points")');
    expect(chartLine({ kind: 'bars', data: 'Body.y', ranges: [] }, sources)).toBe('plot(Body.y, kind: "bar")');
    // A choice not complete writes nothing.
    expect(chartLine({ kind: 'map', source: 'M', ranges: [] }, sources)).toBeUndefined();
  });

  it('offers first what the sheet has last, and kinds only where the sheet has something to draw', () => {
    expect(firstKind(sources)).toBe('map');
    expect(firstChoice('map', sources)).toMatchObject({ source: 'w', ranges: [{ from: '0 m', to: 'a' }, { from: '0 m', to: 'b' }] });
    expect(firstChoice('points', sources)).toMatchObject({ data: 'Body.y', dataX: 'Body.x' });
    expect(kindAvailable('implicit', { ...sources, relations: [] })).toBe(false);
    expect(kindAvailable('surface', { ...sources, functions: sources.functions.slice(0, 2) })).toBe(false);
  });

  it('writes lines the sheet draws without a word against them', () => {
    const sheet = 'L := 4 m\nq := 10 kN/m\nM(x) := q·x·(L - x)/2\nV(x) := q·(L/2 - x)\na := 4 m\nb := 2 m\nw(x, y) := x·(a - x)·y·(b - y)/(1 m^3)\nr := 1 m\nrelation x^2 + y^2 == r^2 {eq=Kruh}\n';
    for (const kind of ['curve', 'map', 'surface', 'implicit'] as const) {
      const line = chartLine(firstChoice(kind, sources), sources)!;
      const r = evaluateSheet(`${sheet}${line}`);
      expect(r.diagnostics.filter((d) => d.severity === 'error'), line).toEqual([]);
      expect(r.statements.at(-1)!.plot, line).toBeDefined();
    }
  });
});
