import { describe, expect, it } from 'vitest';
import { evaluateSheet, type PlotResult } from '../src/index.js';
import { codes } from './helpers.js';

/** The chart of the last line. */
function plot(source: string): PlotResult {
  const result = evaluateSheet(source);
  const last = result.statements.at(-1)!;
  expect(last.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(last.plot, `no chart for: ${source}`).toBeDefined();
  return last.plot!;
}

const BEAM = 'q := 12 kN/m\nL := 5 m\nM(x) := q·x·(L - x)/2\n';

describe('plot', () => {
  it('samples a function over a range, in the units of the sheet', () => {
    const p = plot(`${BEAM}plot(M(x), x: 0 m .. L)`);
    expect(p.kind).toBe('line');
    expect(p.variable).toBe('x');
    expect(p.xUnit).toBe('m');
    expect(p.yUnit).toBe('kN·m');
    const s = p.series[0]!;
    expect(s.xs).toHaveLength(201);
    expect(s.xs[0]).toBe(0);
    expect(s.xs.at(-1)).toBeCloseTo(5, 12);
    // The middle of the span: q·L²/8.
    expect(s.ys[100]).toBeCloseTo(37.5, 9);
  });

  it('takes the unit of the y axis from | unit, and of the x axis from the range', () => {
    const p = plot(`${BEAM}plot(M(x), x: 0 mm .. 5000 mm) | N·m`);
    expect(p.xUnit).toBe('mm');
    expect(p.yUnit).toBe('N·m');
    expect(p.series[0]!.ys[100]).toBeCloseTo(37500, 6);
    expect(codes(`${BEAM}plot(M(x), x: 0 m .. L) | m`)).toEqual(['E-TARGET-UNIT']);
  });

  it('draws more curves on one axis, never two dimensions', () => {
    const p = plot(`${BEAM}V(x) := q·(L/2 - x)\nplot(M(x), V(x)·1 m, x: 0 m .. L)`);
    expect(p.series).toHaveLength(2);
    expect(p.series[1]!.ys[0]).toBeCloseTo(30, 9);
    expect(codes(`${BEAM}V(x) := q·(L/2 - x)\nplot(M(x), V(x), x: 0 m .. L)`)).toEqual(['E-PLOT-UNITS']);
  });

  it('plots data: y for every item of a series, or a series against its order', () => {
    const data = plot('t := [0, 1, 2, 3] s\nv := [0, 2, 3, 3.5] m/s\nplot(v, x: t, kind: "points")');
    expect(data.kind).toBe('points');
    expect(data.series[0]!.xs).toEqual([0, 1, 2, 3]);
    expect(data.series[0]!.ys).toEqual([0, 2, 3, 3.5]);
    // A function of x over measured x: a smooth line across their range.
    const fn = plot('t := [0, 1, 2] s\nplot((2 m/s²)·x², x: t)');
    expect(fn.series[0]!.mark).toBe('line');
    expect([fn.series[0]!.ys[0], fn.series[0]!.ys.at(-1)]).toEqual([0, 8]);
    expect(fn.series[0]!.xs.length).toBeGreaterThan(100);
    const bars = plot('CF := [-100, 30, 40, 50] CZK\nplot(CF, kind: "bar", title: "Peněžní toky")');
    expect(bars.title).toBe('Peněžní toky');
    expect(bars.variable).toBe('');
    expect(bars.series[0]!.xs).toEqual([1, 2, 3, 4]);
    expect(bars.yUnit).toBe('CZK');
  });

  it('draws measured points as points and a curve fitted through them as a line', () => {
    const chart = plot('table Mereni:\n    | t [s] | T [°C] |\n    | 0 | 20.1 |\n    | 10 | 25.3 |\n    | 20 | 29.8 |\n    | 30 | 33.9 |\nT_fit := fit(Mereni.T, x: Mereni.t)\nplot(Mereni.T, T_fit(x), x: Mereni.t)');
    expect(chart.series.map((s) => s.mark)).toEqual(['points', 'line']);
    expect(chart.series[0]!.xs).toEqual([0, 10, 20, 30]);
    expect(chart.series[1]!.ys[0]).toBeCloseTo(20.39, 2);
    expect(chart.series[1]!.ys.at(-1)).toBeCloseTo(34.16, 2);
    expect(chart.yUnit).toBe('°C');
  });

  it('has a variable of its own, and leaves gaps where the expression has no value', () => {
    expect(plot('x := 100\nplot(x², x: 0 .. 2)').series[0]!.ys.at(-1)).toBeCloseTo(4, 12);
    const p = plot('plot(1/x, x: -1 .. 1, samples: 3)');
    expect(p.series[0]!.ys).toEqual([-1, NaN, 1]);
    // t is time inside the call, not tonnes.
    expect(plot('plot(t², t: 0 s .. 2 s, samples: 3)').yUnit).toBe('s²');
  });

  it('puts dates on the x axis as days', () => {
    const p = plot('d := [2026-01-01, 2026-01-11]\nE := [5, 7] kWh\nplot(E, x: d)');
    expect(p.xDates).toBe(true);
    expect(p.series[0]!.xs[1]! - p.series[0]!.xs[0]!).toBe(10);
  });

  it('reports wrong forms', () => {
    expect(codes('y := plot(x, x: 0 .. 1)')).toEqual(['E-PLOT-PLACE']);
    expect(codes('2·plot(x, x: 0 .. 1)')).toEqual(['E-PLOT-PLACE']);
    expect(codes('plot(5)')).toEqual(['E-PLOT-FORM']);
    expect(codes('plot(x, x: 1 .. 0)')).toEqual(['E-PLOT-RANGE']);
    expect(codes('plot(x, x: 0 .. 1, kind: "pie")')).toEqual(['E-PLOT-KIND']);
    expect(codes('plot(x, x: 0 .. 1, samples: 1)')).toEqual(['E-PLOT-SAMPLES']);
    expect(codes('a := [1, 2]\nb := [1, 2, 3]\nplot(a, b)')).toEqual(['E-PLOT-LENGTH']);
    expect(codes('plot(y, x: 0 .. 1)')).toEqual(['E-UNDEFINED']);
  });

  it('is recalculated when what it reads changes', () => {
    const a = evaluateSheet(`${BEAM}plot(M(x), x: 0 m .. L)`);
    expect(a.statements.at(-1)!.dependencies).toEqual(expect.arrayContaining(['M', 'L']));
  });
});

describe('a surface over x and y', () => {
  const PLATE = `a := 4 m
b := 2 m
q := 10 kN/m^2
w(x, y) := q·x·(a - x)·y·(b - y)/(1000 kN·m)
`;
  const surfaceOf = (text: string) => evaluateSheet(text).statements.find((s) => s.plot)?.plot;

  it('is z on a grid in the units of the axes and of z, a map by default', () => {
    const p = surfaceOf(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b) | mm`)!;
    expect(p.kind).toBe('map');
    expect([p.variable, p.yVariable, p.xUnit, p.yUnit, p.surface!.zUnit]).toEqual(['x', 'y', 'm', 'm', 'mm']);
    expect(p.surface!.xs).toHaveLength(51);
    expect(p.surface!.z[25]![25]).toBeCloseTo(40, 9);
    expect(p.xRange).toEqual([0, 4]);
    expect(p.yRange).toEqual([0, 2]);
    // Both axes in metres: drawn at one scale, the plate twice as wide as high.
    expect(p.equalScale).toBe(true);
  });

  it('takes its grid, levels and extremes from the options', () => {
    const p = surfaceOf(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, samples: 20, levels: [10, 20, 30] mm, extremes: true) | mm`)!;
    expect(p.surface!.xs).toHaveLength(21);
    expect(p.surface!.levels).toEqual([10, 20, 30]);
    expect(p.surface!.extremes![0]).toEqual({ x: 2, y: 1, z: 40, peak: true });
    expect(surfaceOf(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, levels: 5)`)!.surface!.levelCount).toBe(5);
    expect(codes(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, levels: [1, 2] s)`)).toContain('E-PLOT-LEVELS');
    expect(codes(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, kind: "bar")`)).toContain('E-PLOT-KIND');
  });

  it('has holes where it has no value, and is not an implicit curve', () => {
    const p = surfaceOf('plot(sqrt(1 - x^2 - y^2), x: -1 .. 1, y: -1 .. 1)')!;
    expect(p.surface!.z[0]![0]).toBeNaN();
    expect(p.surface!.z[25]![25]).toBe(1);
    expect(surfaceOf('plot(x^2 + y^2 == 1, x: -2 .. 2, y: -2 .. 2)')!.surface).toBeUndefined();
  });
  it('is seen in 3D from the view written in its line', () => {
    const p = surfaceOf(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, kind: "surface", view: "az=-200 el=40") | mm`)!;
    expect(p.kind).toBe('surface');
    expect(p.surface!.view).toEqual({ az: 160, el: 40 });
    expect(surfaceOf(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, kind: "surface")`)!.surface!.view).toBeUndefined();
    expect(codes(`${PLATE}plot(w(x, y), x: 0 m .. a, y: 0 m .. b, kind: "surface", view: "el=120")`)).toContain('E-PLOT-VIEW');
  });
});
