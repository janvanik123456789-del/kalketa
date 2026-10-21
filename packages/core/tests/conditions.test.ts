import { describe, expect, it } from 'vitest';
import { evaluateSheet, SheetSession, type Quantity } from '../src/index.js';

const coefficients = (c: number) => `a := 5\nb := 4\nc := ${c}\n`;

/** The roots of the last line: each value (re, im) and whether it was kept. */
function roots(source: string) {
  const r = evaluateSheet(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const last = r.statements.at(-1)!;
  return {
    roots: last.roots!.roots.map((root) => ({ re: Number(root.value.si.toFixed(4)), im: Number((root.value.im ?? 0).toFixed(4)), kept: root.rejected === undefined })),
    discriminant: last.roots!.quadratic?.discriminant.si,
    values: r.values,
  };
}

describe('the conditions of a solution, as on paper', () => {
  it('gives no real root of a quadratic with D < 0, and its complex roots in ℂ', () => {
    const real = roots(`${coefficients(10)}solve x ∈ ℝ: a·x^2 + b·x + c == 0`);
    expect(real.discriminant).toBe(-184);
    expect(real.roots.every((r) => !r.kept)).toBe(true);
    expect(real.values.has('x')).toBe(false);
    const complex = roots(`${coefficients(10)}solve x ∈ ℂ: a·x^2 + b·x + c == 0`);
    expect(complex.roots).toEqual([{ re: -0.4, im: 1.3565, kept: true }, { re: -0.4, im: -1.3565, kept: true }]);
  });

  it('keeps the roots meeting the conditions: one a value, more a vector', () => {
    const one = roots(`${coefficients(-10)}solve x ∈ ℝ, x > 0: a·x^2 + b·x + c == 0`);
    expect(one.roots).toEqual([{ re: 1.0697, im: 0, kept: true }, { re: -1.8697, im: 0, kept: false }]);
    expect((one.values.get('x') as Quantity).si).toBeCloseTo(1.0697, 3);
    const both = roots(`${coefficients(-10)}solve x ∈ R: a·x^2 + b·x + c == 0`);
    expect(both.values.get('x')?.type).toBe('vector');
  });

  it('writes both values of ±, and solves a quadratic with 0 on one side without conditions', () => {
    const r = evaluateSheet(`${coefficients(-10)}w := (-b ± √(b^2 - 4·a·c))/(2·a)\nsolve u: a·u^2 + b·u + c == 0`);
    const w = r.values.get('w');
    expect(w?.type === 'vector' && w.items.map((q) => Number(q.si.toFixed(4)))).toEqual([1.0697, -1.8697]);
    expect((r.values.get('u') as Quantity).si).toBeCloseTo(1.0697, 3);
  });

  it('keeps the whole roots in ℕ, ℕ₀ and ℤ', () => {
    // x² − x − 6 = 0: x = 3 and x = −2.
    const kept = (domain: string) => roots(`solve x ∈ ${domain}: x^2 - x - 6 == 0`).roots.filter((r) => r.kept).map((r) => r.re);
    expect(kept('ℕ')).toEqual([3]);
    expect(kept('ℤ')).toEqual([3, -2]);
    expect(kept('N')).toEqual([3]);
    // x² − 3x = 0: 0 is in ℕ₀, not in ℕ.
    const zero = (domain: string) => roots(`solve x ∈ ${domain}: x^2 - 3·x == 0`).roots.filter((r) => r.kept).map((r) => r.re);
    expect(zero('ℕ')).toEqual([3]);
    expect(zero('ℕ₀')).toEqual([3, 0]);
    expect(zero('ℕ_0')).toEqual([3, 0]);
    // 2x² − 5x + 2 = 0: 2 and 0,5; a half is no whole number.
    expect(roots('solve n ∈ ℤ: 2·n^2 - 5·n + 2 == 0').roots).toEqual([{ re: 2, im: 0, kept: true }, { re: 0.5, im: 0, kept: false }]);
    // A length is no count: no root kept.
    expect(roots('solve L ∈ ℕ: L^2 == 4 m^2').roots.every((r) => !r.kept)).toBe(true);
    expect(evaluateSheet('solve x ∈ ℚ: x^2 == 4').diagnostics.map((d) => d.code)).toContain('E-SYNTAX');
  });

  it('allows the domain and the conditions with one unknown and one equation only', () => {
    expect(evaluateSheet('solve (x, y) ∈ ℝ: x + y == 1, x - y == 0').diagnostics.map((d) => d.code)).toContain('E-SOLVE-CONDITIONS');
  });
});

describe('a quadratic written as a function of the sheet', () => {
  it('is written out into the equation and solved as one: y(x) := a·x² + b·x + c, solve x ∈ ℝ: y(x) == 0', () => {
    const found = roots(`${coefficients(-10)}y(x) := a·x^2 + b·x + c\nsolve x ∈ ℝ, x > 0: y(x) == 0`);
    expect(found.discriminant).toBe(216);
    expect(found.roots.map((r) => r.kept)).toEqual([true, false]);
    // Without conditions too: the one positive root.
    const r = evaluateSheet(`${coefficients(-10)}y(x) := a·x^2 + b·x + c\nsolve u: y(u) == 0`);
    expect((r.values.get('u') as Quantity).si).toBeCloseTo(1.0697, 3);
  });
});

describe('the y axis of a chart set by hand', () => {
  it('gives the range in the unit of the curves, smaller first', () => {
    const r = evaluateSheet('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, ylim: -15 .. 15)');
    expect(r.statements.at(-1)!.plot?.yRange).toEqual([-15, 15]);
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, ylim: 5 .. 1)').diagnostics.map((d) => d.code)).toContain('E-PLOT-YLIM');
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, ylim: 0 m .. 1 m)').diagnostics.map((d) => d.code)).toContain('E-PLOT-UNITS');
  });
});

describe('the roots of a curve in a chart', () => {
  it('are found where it crosses the x axis, refined to the exact value', () => {
    const r = evaluateSheet('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, roots: true)');
    const roots = r.statements.at(-1)!.plot!.series[0]!.roots!;
    expect(roots.map((x) => Number(x.toFixed(6)))).toEqual([-1.869694, 1.069694]);
    expect(evaluateSheet('plot(x^2 + 1, x: -3 .. 2, roots: true)').statements.at(-1)!.plot!.series[0]!.roots).toBeUndefined();
  });
});

describe('the axis of symmetry of a curve in a chart', () => {
  it('stands at the top or bottom of a symmetric curve only', () => {
    const axes = (source: string) => evaluateSheet(source).statements.at(-1)!.plot!.series[0]!.axes?.map((x) => Number(x.toFixed(5)));
    expect(axes('y(x) := 5·x^2 + 4·x - 10\nplot(y(x), x: -3 .. 2, symmetry: true)')).toEqual([-0.4]);
    expect(axes('plot(cos(x), x: -5 .. 5, symmetry: true)')).toEqual([0]);
    expect(axes('plot(x^3 - x, x: -2 .. 2, symmetry: true)')).toBeUndefined();
  });
});

describe('the roots as printed are names for what follows', () => {
  it('gives x_1 and x_2 for an integral between them, the one set aside by a condition too', () => {
    const r = evaluateSheet('y(x) := x^2 - 5\nsolve x ∈ ℝ, x > 0: y(x) == 0\nS := integral(y(x), x: x_2 .. x_1)');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect((r.values.get('x_1') as Quantity).si).toBeCloseTo(Math.sqrt(5), 12);
    expect((r.values.get('x_2') as Quantity).si).toBeCloseTo(-Math.sqrt(5), 12);
    expect((r.values.get('S') as Quantity).si).toBeCloseTo((-20 * Math.sqrt(5)) / 3, 6);
    // No real root: no names; a name the sheet has itself stays its own.
    expect(evaluateSheet('solve x ∈ ℝ: x^2 + 1 == 0').values.has('x_1')).toBe(false);
    expect((evaluateSheet('x_1 := 7\nsolve x ∈ ℝ: x^2 - 4 == 0').values.get('x_1') as Quantity).si).toBe(7);
  });

  it('marks the chart points at the precision of the chart: the vertex of x² − 5 at 0, not 2·10⁻⁸', () => {
    const s = evaluateSheet('plot(x^2 - 5, x: -10 .. 10, symmetry: true, extremes: true)').statements.at(-1)!.plot!.series[0]!;
    expect(s.axes).toEqual([0]);
    expect(s.extremes).toEqual([{ x: 0, y: -5, peak: false }]);
  });
});

describe('the tools of a chart: area, tangent, inflections, labels moved by hand', () => {
  it('gives the integral of the hatched area, the slope at the tangent point and the turns of the bend', () => {
    const r = evaluateSheet('y(x) := x^2 - 5\nsolve x ∈ ℝ: y(x) == 0\nplot(y(x), x: -4 .. 4, area: x_2 .. x_1, tangent: 3, labels: "s=10,-20 r0.1=0,15")\nplot(x^3 - 3·x, x: -2.5 .. 2.5, inflections: true)');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = r.statements[2]!.plot!;
    expect(p.area!.value).toBeCloseTo((-20 * Math.sqrt(5)) / 3, 8);
    expect([p.area!.from, p.area!.to].map((x) => Number(x.toFixed(6)))).toEqual([-2.236068, 2.236068]);
    expect(p.tangent!.y).toBeCloseTo(4, 9);
    expect(p.tangent!.slope).toBeCloseTo(6, 6);
    expect(p.labelOffsets).toEqual({ s: [10, -20], 'r0.1': [0, 15] });
    expect(r.statements[3]!.plot!.series[0]!.inflections).toEqual([{ x: 0, y: 0 }]);
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, area: 1)').diagnostics.map((d) => d.code)).toContain('E-PLOT-AREA');
  });
});

describe('the hatch linked to an integral of the sheet', () => {
  it('takes its bounds, its integrand, its name and its value', () => {
    const r = evaluateSheet('y(x) := x^2 - 5\nsolve x ∈ ℝ: y(x) == 0\nP := abs(integral(y(x), x: x_2 .. x_1))\nplot(y(x), x: -4 .. 4, area: P)');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const a = r.statements.at(-1)!.plot!.area!;
    expect(a.name).toBe('P');
    expect(a.value).toBeCloseTo((20 * Math.sqrt(5)) / 3, 8);
    expect([a.from, a.to].map((x) => Number(x.toFixed(6)))).toEqual([-2.236068, 2.236068]);
    expect(a.ys![60]).toBeCloseTo(-5, 9);
    // A name that is no integral: said so.
    expect(evaluateSheet('q := 3\nplot(x^2, x: 0 .. 1, area: q)').diagnostics.map((d) => d.code)).toContain('E-PLOT-AREA');
  });
});

describe('the hatch linked to a formula by its name', () => {
  it('finds an integral named {eq=Integral1} below the chart, and follows a change of it', () => {
    const sheet = (bounds: string) => `y(x) := -2·x^2 + 2·x + 10\nplot(y(x), x: -10 .. 10, ylim: -50 .. 20, area: Integral1)\nintegral(y(x), x: ${bounds}) {eq=Integral1}`;
    const session = new SheetSession();
    const first = session.update(sheet('-1 .. 2'));
    expect(first.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(first.statements[1]!.plot!.area).toMatchObject({ name: 'Integral1', value: 27, from: -1, to: 2 });
    // The integral changed below the chart: the chart is calculated anew, not taken from before.
    expect(session.update(sheet('0 .. 2')).statements[1]!.plot!.area).toMatchObject({ from: 0, to: 2 });
  });
});

describe('the quadratic sheet: vertex, points of the sheet, area over the axis, sliders', () => {
  it('gives the vertex with the roots, splits the area above and below the axis, marks points of the sheet', () => {
    const r = evaluateSheet('a := -2 {slider=-5..5}\nb := 2\nc := 10\ny(x) := a·x^2 + b·x + c\nsolve x ∈ ℝ: y(x) == 0\nplot(y(x), x: -3 .. 4, area: -1 .. 3, points: [x_1, 0 | 0.5, 10.5])');
    expect(r.diagnostics).toEqual([]);
    expect(r.statements[0]!.statement.format?.slider).toEqual({ low: -5, high: 5 });
    const v = r.statements[4]!.roots!.quadratic!.vertex;
    expect([v.x.si, v.y.si]).toEqual([0.5, 10.5]);
    const p = r.statements[5]!.plot!;
    // ∫₋₁³ y dx = 29,33; below the axis from x₂ = 2,791 to 3.
    expect(p.area!.value).toBeCloseTo(88 / 3, 9);
    expect(p.area!.above! - p.area!.below!).toBeCloseTo(88 / 3, 9);
    expect(p.area!.below).toBeCloseTo(0.20568, 4);
    expect(p.points!.map((q) => q.y)).toEqual([0, 10.5]);
    expect(p.points![0]!.x).toBeCloseTo((-2 + Math.sqrt(84)) / -4, 12);
    expect(evaluateSheet('a := 1 {slider=5..1}').diagnostics.map((d) => d.code)).toContain('W-FORMAT');
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, points: 3)').diagnostics.map((d) => d.code)).toContain('E-PLOT-POINTS');
  });
});

describe('a chart above what it draws', () => {
  it('is drawn once the sheet is calculated, its S and V the names below (not siemens and volt)', () => {
    const r = evaluateSheet('a := -2\nplot(y(x), x: -4 .. 5, roots: true, area: S, points: V)\ny(x) := a·x^2 + 2·x + 10\nsolve x ∈ ℝ: y(x) == 0\nS := abs(integral(y(x), x: x_1 .. x_2))\nV := [0.5, 10.5]');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const p = r.statements[1]!.plot!;
    expect(p.area).toMatchObject({ name: 'S' });
    expect(p.area!.value).toBeCloseTo(32.078029864690876, 8);
    expect(p.points).toEqual([{ x: 0.5, y: 10.5 }]);
  });
});

describe('a chart outside the domain of its parts', () => {
  it('goes on drawing its curve without the parts that cannot be calculated, and says so', () => {
    // a = 5: D < 0, no real roots, so no area S between them; the parabola, its vertex and the tangent stay.
    const r = evaluateSheet('a := 5\nb := 2\nc := 10\ny(x) := a·x^2 + b·x + c\nsolve x ∈ ℝ: y(x) == 0\nS := abs(integral(y(x), x: x_1 .. x_2))\nV := [-b/(2·a), c - b^2/(4·a)]\nplot(y(x), x: -4 .. 5, roots: true, area: S, points: V, tangent: -1)');
    const chart = r.statements.at(-1)!;
    expect(chart.status).toBe('ok');
    expect(chart.plot!.area).toBeUndefined();
    expect(chart.plot!.points).toHaveLength(1);
    expect(chart.plot!.tangent).toBeDefined();
    expect(chart.diagnostics.map((d) => d.code)).toEqual(['W-PLOT-NO-AREA']);
    // Written wrong stays an error.
    expect(evaluateSheet('plot(x^2, x: 0 .. 1, area: 1)').diagnostics.map((d) => d.code)).toContain('E-PLOT-AREA');
  });
});

describe('the sheet outside the domain of the roots', () => {
  it('leaves the lines reading x_1, x_2 out as not to be calculated, not as errors', () => {
    const r = evaluateSheet('solve x ∈ ℝ: 5·x^2 + 2·x + 10 == 0\nS := x_1 + x_2');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.statements[1]!.status).toBe('blocked');
  });

  it('lets the y axis follow the values while the range given would hide the curve', () => {
    const hidden = evaluateSheet('plot(5·x^2 + 2·x + 25, x: -4 .. 5, ylim: -30 .. 20)').statements[0]!;
    expect(hidden.plot!.yRange).toBeUndefined();
    expect(hidden.diagnostics.map((d) => d.code)).toEqual(['W-PLOT-YLIM-HIDES']);
    expect(evaluateSheet('plot(-2·x^2 + 2·x + 10, x: -4 .. 5, ylim: -30 .. 20)').statements[0]!.plot!.yRange).toEqual([-30, 20]);
  });
});
