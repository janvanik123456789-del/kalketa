import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession } from '../src/index.js';

const codes = (source: string) => evaluateSheet(source).diagnostics.map((d) => d.code);
const result = (source: string, line: number) => evaluateSheet(source).statements.find((r) => r.statement.span.line === line)!;

describe('relations', () => {
  it('take a relation as an equation that holds: no check, no error for names without a value', () => {
    const r = result('relation dV - dV_0 == (2·ε_xx + ε_zz)·dV_0', 1);
    expect(r.status).toBe('ok');
    expect(r.diagnostics).toEqual([]);
    expect(r.statement.kind === 'derive' && r.statement.relation).toBe(true);
  });

  it('let a step that is no identity follow from the relation above it (differentials of the cube under water)', () => {
    const sheet = 'relation dV - dV_0 == (2·ε_xx + ε_zz)·dV_0 {eq=3}\nderive (dV - dV_0)/dV_0 == 2·ε_xx + ε_zz\nderive dV == dV_0·(1 + 2·ε_xx + ε_zz)';
    expect(result(sheet, 2).derivation).toEqual([{ ok: true, relation: { label: '3', line: 1 } }]);
    expect(result(sheet, 3).derivation).toEqual([{ ok: true, relation: { label: '3', line: 1 } }]);
    expect(codes(sheet)).toEqual([]);
    // Without the relation the same step is wrong, and so is one that does not follow from it.
    expect(codes('derive (dV - dV_0)/dV_0 == 2·ε_xx + ε_zz')).toEqual(['E-DERIVE-STEP']);
    expect(codes('relation dV - dV_0 == (2·ε_xx + ε_zz)·dV_0\nderive dV == dV_0·(1 + ε_xx + ε_zz)')).toEqual(['E-DERIVE-STEP']);
  });

  it('let a step follow from two relations at once, the later one moving a name of the earlier (cube under water, (3) and (4))', () => {
    const sheet = 'relation dV - dV_0 == (ε_xx + ε_yy + ε_zz)·dV_0 {eq=3}\nrelation ε_yy == ε_xx\nderive dV - dV_0 == (2·ε_xx + ε_zz)·dV_0';
    expect(codes(sheet)).toEqual([]);
    expect(result(sheet, 3).derivation).toEqual([{ ok: true, relation: { line: 2 } }]);
    // Without the second relation it does not follow.
    expect(codes('relation dV - dV_0 == (ε_xx + ε_yy + ε_zz)·dV_0\nderive dV - dV_0 == (2·ε_xx + ε_zz)·dV_0')).toEqual(['E-DERIVE-STEP']);
  });

  it('follow a chain of relations through their symbols, the dimensions worked out from them (water on a dam)', () => {
    const sheet = [
      'ρ := 1000 kg/m^3', 'g := 9.81 m/s^2', 'l := 100 m',
      'relation dS == l·dy', 'relation p == p_h + p_a', 'relation dF_1 == p·dS', 'relation dF_2 == p_a·dS',
      'relation dF == dF_1 - dF_2', 'relation p_h == ρ·g·y',
      'derive dF == ρ·g·y·l·dy',
    ].join('\n');
    expect(codes(sheet)).toEqual([]);
    expect(result(sheet, 10).derivation).toEqual([{ ok: true, relation: { line: 9 } }]);
    // A step that does not follow from the chain is still wrong.
    expect(codes(sheet.replace('derive dF == ρ·g·y·l·dy', 'derive dF == 2·ρ·g·y·l·dy'))).toEqual(['E-DERIVE-STEP']);
  });

  it('keep identities as they were: a step that holds in general names no relation', () => {
    const r = result('relation x^2 + y^2 == r^2\nderive (x + y)^2 == x^2 + 2·x·y + y^2', 2);
    expect(r.derivation).toEqual([{ ok: true }]);
  });

  it('let a step follow from a relation of the circle, with the values of the sheet as symbols', () => {
    const sheet = 'r := 5 m\nrelation x^2 + y^2 == r^2\nderive y^2 == r^2 - x^2';
    expect(result(sheet, 3).derivation).toEqual([{ ok: true, relation: { line: 2 } }]);
  });

  it('solve by the name of a relation, with conditions, as on paper', () => {
    const sheet = 'relation x^2 + y^2 == r^2 {eq=Kruh}\nx := 3\nr := 5\nsolve y ∈ ℝ, y > 0: Kruh\nz := y';
    expect(codes(sheet)).toEqual([]);
    expect(evaluateSheet(sheet).values.get('z')).toMatchObject({ type: 'quantity', si: 4 });
    // Without conditions: one root as before (the positive one).
    expect(evaluateSheet('relation x^2 + y^2 == r^2 {eq=Kruh}\nx := 3\nr := 5\nsolve y: Kruh').values.get('y')).toMatchObject({ si: 4 });
  });

  it('report a name that is no relation in a solve', () => {
    expect(codes('a := 3\nsolve y: a')).toEqual(['E-SOLVE-RELATION']);
    expect(codes('solve y: Kruh')).toEqual(['E-SOLVE-RELATION']);
  });

  it('recalculate a solve when its relation changes', () => {
    const session = new SheetSession();
    const first = session.update('relation x^2 + y^2 == r^2 {eq=Kruh}\nx := 3\nr := 5\nsolve y ∈ ℝ, y > 0: Kruh');
    expect(first.values.get('y')).toMatchObject({ si: 4 });
    const second = session.update('relation x^2 + y^2 == 2·r^2 {eq=Kruh}\nx := 3\nr := 5\nsolve y ∈ ℝ, y > 0: Kruh');
    expect((second.values.get('y') as { si: number }).si).toBeCloseTo(Math.sqrt(41), 9);
  });

  describe('implicit curves in a chart', () => {
    const chart = (source: string) => {
      const r = evaluateSheet(source).statements.at(-1)!;
      expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      return r.plot!;
    };
    const onCircle = (xs: readonly number[], ys: readonly number[], radius: number) =>
      xs.every((x, i) => Number.isNaN(x) || Math.abs(Math.hypot(x, ys[i]!) - radius) < radius * 0.01);

    it('draw an equation over x and y as a closed curve, the axes over the ranges given, at one scale', () => {
      const plot = chart('plot(x^2 + y^2 == 25, x: -6 .. 6, y: -6 .. 6)');
      const circle = plot.series[0]!;
      expect(circle.implicit).toBe(true);
      expect(circle.xs.length).toBeGreaterThan(100);
      expect(onCircle(circle.xs, circle.ys, 5)).toBe(true);
      // One closed piece: it ends where it began.
      expect(circle.xs.filter(Number.isNaN)).toEqual([]);
      expect(circle.xs.at(-1)).toBeCloseTo(circle.xs[0]!, 9);
      expect(plot.xRange).toEqual([-6, 6]);
      expect(plot.yRange).toEqual([-6, 6]);
      expect(plot.yVariable).toBe('y');
      expect(plot.equalScale).toBe(true);
    });

    it('draw a relation by its name, beside an ordinary curve, with units', () => {
      const plot = chart('r := 5 m\nrelation x^2 + y^2 == r^2 {eq=Kruh}\ny_p(x) := x^2/(4 m)\nplot(Kruh, y_p(x), x: -6 m .. 6 m, y: -6 m .. 6 m)');
      expect(plot.series[0]!.implicit).toBe(true);
      expect(onCircle(plot.series[0]!.xs, plot.series[0]!.ys, 5)).toBe(true);
      expect(plot.series[1]!.implicit).toBeUndefined();
      expect(plot.series[1]!.ys[100]).toBeCloseTo(0, 9);
      expect(plot.xUnit).toBe('m');
      expect(plot.yUnit).toBe('m');
    });

    it('leave out a change of sign across a pole: y = 1/x has no line at x = 0', () => {
      const curve = chart('plot(x·y == 1, x: -2 .. 2, y: -2 .. 2)').series[0]!;
      expect(curve.xs.filter(Number.isFinite).every((x, i, all) => Math.abs(x * curve.ys[curve.xs.indexOf(all[i]!)]! - 1) < 0.05)).toBe(true);
      const pole = chart('plot(y == 1/x, x: -2 .. 2, y: -2 .. 2)').series[0]!;
      expect(pole.xs.filter(Number.isFinite).every((x) => Math.abs(x) > 0.3)).toBe(true);
    });

    it('ask for the range of y and for sides of one unit', () => {
      expect(codes('plot(x^2 + y^2 == 25, x: -6 .. 6)')).toEqual(['E-PLOT-IMPLICIT']);
      expect(codes('plot(x^2 + y^2 == 25 m, x: -6 .. 6, y: -6 .. 6)')).toEqual(['E-PLOT-IMPLICIT']);
      // An ordinary chart keeps its one variable.
      expect(codes('plot(x^2, x: 0 .. 1, y: 0 .. 1)')).toEqual(['E-NAMED-ARG']);
    });
  });
});
