import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

/** Stage 2 of docs/navrhy/VYBER-VZORU.md: solve as a value inside a formula, a function, a table. */
const run = (source: string) => evaluateSheet(source);
const codes = (source: string) => run(source).diagnostics.map((d) => d.code);
const si = (source: string, name: string): number => {
  const v = run(source).values.get(name) as { si?: number } | undefined;
  if (typeof v?.si !== 'number') throw new Error(`${name}: ${JSON.stringify(run(source).diagnostics.map((d) => `${d.code} ${d.span.line}`))}`);
  return v.si;
};
const list = (source: string, name: string): number[] => {
  const v = run(source).values.get(name) as unknown as { items?: { si: number }[] } | undefined;
  if (!v?.items) throw new Error(`${name}: ${JSON.stringify(codes(source))}`);
  return v.items.map((q) => q.si);
};

/** λ of the Colebrook equation by plain iteration, independently of the solver. */
const colebrook = (re: number, e: number): number => {
  let x = 6;
  for (let i = 0; i < 200; i++) x = -2 * Math.log10(e / 3.7 + (2.51 * x) / re);
  return 1 / x ** 2;
};
const LAMBDA = 'lam(Re, e) := solve l: 1/sqrt(l) == -2·log10(e/3.7 + 2.51/(Re·sqrt(l))) in 0.005 .. 0.1\n';

describe('solve as a value', () => {
  it('stands in a definition, in both spellings', () => {
    expect(si('a := solve x: x^2 == 2 in 0 .. 2', 'a')).toBeCloseTo(Math.SQRT2, 10);
    expect(si('a := solve(x^2 == 2, x: 0 .. 2)', 'a')).toBeCloseTo(Math.SQRT2, 10);
    expect(si('a := solve(x^3 + x == 2, x: 0.5)', 'a')).toBeCloseTo(1, 9);
    expect(si('a := solve x: x^3 + x == 2 guess x = 0.5', 'a')).toBeCloseTo(1, 9);
  });

  it('stands inside a formula', () => {
    expect(si('a := 1 + 2·(solve x: x^2 == 4 in 0 .. 3)', 'a')).toBeCloseTo(5, 10);
    expect(si('a := -log10(solve h: h^2 == 1e-6 in 1e-9 .. 1)', 'a')).toBeCloseTo(3, 9);
  });

  it('stands on a line of its own, beside the statement', () => {
    const r = run('solve(x^2 == 2, x: 0 .. 2)\nsolve (a, b):\n    a + b == 3\n    a - b == 1\n    guess a = 1, b = 1');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect((r.values.get('a') as { si: number }).si).toBeCloseTo(2, 9);
    expect(r.statements[0]!.display?.value).toBeCloseTo(Math.SQRT2, 10);
  });

  it('solves by formula where it can, without an interval', () => {
    expect(si('b := 4\na := solve(2·x == b, x)', 'a')).toBeCloseTo(2, 12);
    expect(si('b := 4\na := solve x: 2·x == b', 'a')).toBeCloseTo(2, 12);
  });

  it('keeps units', () => {
    const sheet = 'g := 9.81 m/s^2\nh := 20 m\nt_f := solve t: h == g·t^2/2 in 0 s .. 10 s';
    expect(si(sheet, 't_f')).toBeCloseTo(Math.sqrt(40 / 9.81), 9);
    expect(run(sheet).statements[2]!.display?.unit).toBe('s');
  });

  it('its unknown is its own: t is neither a unit nor the t of the sheet', () => {
    const sheet = 't := 100\na := solve t: t + 1 == 3 in 0 .. 10\nb := t + a';
    expect(si(sheet, 'b')).toBeCloseTo(102, 9);
    expect(si('a := solve t: t^2 == 9 in 0 .. 5\nb := 2 t', 'b')).toBe(2000);
  });

  it('says what it needs', () => {
    expect(codes('a := solve(1 + 1, x: 0 .. 1)')).toContain('E-SOLVE-VALUE-FORM');
    expect(codes('a := solve(x == 1)')).toContain('E-SOLVE-VALUE-FORM');
    expect(codes('a := solve x: x^2 == -1 in 0 .. 1')).toContain('E-SOLVE-NO-ROOT');
  });
});

describe('a function defined by an equation', () => {
  it('Colebrook: λ(Re, ε/D)', () => {
    for (const [re, e] of [[1e5, 1e-4], [4e4, 1e-3], [1e6, 5e-5]] as const) {
      expect(si(`${LAMBDA}a := lam(${re}, ${e})`, 'a')).toBeCloseTo(colebrook(re, e), 9);
    }
  });

  it('takes a series', () => {
    const got = list(`${LAMBDA}a := lam([1e5, 1e6], 1e-4)`, 'a');
    expect(got[0]).toBeCloseTo(colebrook(1e5, 1e-4), 9);
    expect(got[1]).toBeCloseTo(colebrook(1e6, 1e-4), 9);
  });

  it('goes into another solve: the velocity for a given head loss', () => {
    // h = λ·(L/D)·v²/(2·g): the design of a pipe, an equation inside an equation.
    const sheet = `${LAMBDA}D := 0.2 m\nL := 500 m\nnu := 1e-6 m^2/s\ng := 9.81 m/s^2\nloss(v) := lam(v·D/nu, 1e-3)·(L/D)·v^2/(2·g)\nsolve v: loss(v) == 10 m in 0.1 m/s .. 10 m/s`;
    const v = si(sheet, 'v');
    expect(colebrook((v * 0.2) / 1e-6, 1e-3) * (500 / 0.2) * (v ** 2 / (2 * 9.81))).toBeCloseTo(10, 6);
  });

  it('is drawn, a point without a root left out', () => {
    const r = run('f(p) := solve x: x^2 == p in 0 .. 2\nplot(f(p), p: -1 .. 4)');
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const plot = r.statements[1]!.plot!;
    const ys = plot.series[0]!.ys;
    expect(ys.some(Number.isFinite)).toBe(true);
    expect(ys.some(Number.isNaN)).toBe(true);
  });

  it('titration of acetic acid with NaOH (LibreTexts 14.10.2): pH 2.87, 4.74, 8.72, 12.30', () => {
    const sheet = `K_a := 1.8e-5 mol/l
K_w := 1e-14 mol^2/l^2
c_a := 0.100 mol/l
c_b := 0.100 mol/l
V_a := 25.00 ml
pH(V) := -log10((solve h: h + c_b·V/(V_a + V) == K_w/h + c_a·V_a/(V_a + V)·K_a/(K_a + h) in 1e-14 mol/l .. 1 mol/l)/(1 mol/l))
p := pH([0, 12.5, 25, 37.5] ml)`;
    const p = list(sheet, 'p');
    expect(Math.abs(p[0]! - 2.87)).toBeLessThan(0.01);
    expect(Math.abs(p[1]! - 4.74)).toBeLessThan(0.01);
    expect(Math.abs(p[2]! - 8.72)).toBeLessThan(0.01);
    expect(Math.abs(p[3]! - 12.3)).toBeLessThan(0.01);
  });
});

describe('a column of a table that solves', () => {
  it('solves in each row', () => {
    const sheet = 'table T:\n    | Re | lam = solve(1/sqrt(l) == -2·log10(2.51/(Re·sqrt(l))), l: 0.005 .. 0.1) |\n    | 1e5 | |\n    | 1e6 | |\na := T.lam[1]\nb := T.lam[2]';
    expect(si(sheet, 'a')).toBeCloseTo(colebrook(1e5, 0), 9);
    expect(si(sheet, 'b')).toBeCloseTo(colebrook(1e6, 0), 9);
  });

  it('calls a function that solves', () => {
    const sheet = `${LAMBDA}table T:\n    | Re | e | f = lam(Re, e) |\n    | 1e5 | 0.001 | |\na := T.f[1]`;
    expect(si(sheet, 'a')).toBeCloseTo(colebrook(1e5, 0.001), 9);
  });
});

describe('the least whole number', () => {
  it('when to replace an air conditioner (NIST HB 135, Ex. 9.1: the end of year 4)', () => {
    const sheet = 'C := 3360.79 USD\nS := 3250 USD\nt_v := first(C <= S·1.01^t, t: 1 .. 20)';
    expect(si(sheet, 't_v')).toBe(4);
  });

  it('with a unit, steps of one unit', () => {
    const sheet = 'a := first(100 m <= (3 m/yr)·t, t: 1 yr .. 50 yr)';
    expect(run(sheet).statements[0]!.display?.value).toBe(34);
    expect(run(sheet).statements[0]!.display?.unit).toBe('yr');
  });

  it('takes the first of the range, and its last', () => {
    expect(si('a := first(n >= 0, n: 1 .. 5)', 'a')).toBe(1);
    expect(si('a := first(n >= 5, n: 1 .. 5)', 'a')).toBe(5);
  });

  it('says when there is none', () => {
    expect(codes('a := first(n > 5, n: 1 .. 5)')).toContain('E-FIRST-NONE');
    expect(codes('a := first(n + 1, n: 1 .. 5)')).toContain('E-TYPE');
    expect(codes('a := first(n > 1, n: 0.5 .. 5)')).toContain('E-DOMAIN');
  });

  it('goes into a function', () => {
    const sheet = 'bolts(F) := first(n·10 kN >= F, n: 1 .. 100)\na := bolts(35 kN)\nb := bolts([5, 25] kN)';
    expect(si(sheet, 'a')).toBe(4);
    expect(list(sheet, 'b')).toEqual([1, 3]);
  });
});
