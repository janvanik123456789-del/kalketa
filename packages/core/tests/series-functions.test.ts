import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

/** Stage 1 of docs/navrhy/VYBER-VZORU.md. The numbers come from the books named or are worked out by hand. */
const run = (source: string) => evaluateSheet(source);
const codes = (source: string) => run(source).diagnostics.map((d) => d.code);
const si = (source: string, name: string): number => {
  const v = run(source).values.get(name) as { si?: number } | undefined;
  if (typeof v?.si !== 'number') throw new Error(`${name}: ${JSON.stringify(codes(source))}`);
  return v.si;
};
const list = (source: string, name: string): number[] => {
  const v = run(source).values.get(name) as { items?: { si: number }[] } | undefined;
  if (!v?.items) throw new Error(`${name}: ${JSON.stringify(codes(source))}`);
  return v.items.map((q) => q.si);
};
const unit = (source: string, name: string) => run(source).statements.find((s) => s.statement.kind === 'definition' && s.statement.name === name)?.display?.unit;

describe('a function of a number on a series', () => {
  it('goes item by item', () => {
    expect(list('a := sqrt([4, 9, 16])', 'a')).toEqual([2, 3, 4]);
    expect(list('a := abs([-1, 2])', 'a')).toEqual([1, 2]);
    expect(list('a := round([1.4, 1.6])', 'a')).toEqual([1, 2]);
    expect(list('a := mod([5, 7], 3)', 'a')).toEqual([2, 1]);
    expect(list('a := log([8, 16], 2)', 'a')[1]).toBeCloseTo(4, 12);
    expect(list('a := norminv([0.5, 0.975])', 'a')[1]).toBeCloseTo(1.95996, 4);
    expect(list('a := tcdf([0, 0], 5)', 'a')).toEqual([0.5, 0.5]);
  });

  it('keeps units and complex parts', () => {
    expect(list('a := sqrt([4, 9] m^2)', 'a')).toEqual([2, 3]);
    const sheet = 'r := [1, 2]·(3 + 4j)\nz := abs(r)\nw := im(r)';
    expect(list(sheet, 'z')).toEqual([5, 10]);
    expect(list(sheet, 'w')).toEqual([4, 8]);
  });

  it('says when two series differ in length', () => {
    expect(codes('a := mod([5, 7], [1, 2, 3])')).toContain('E-VECTOR-LENGTH');
  });

  it('a number stays a number', () => {
    expect(si('a := sqrt(16)', 'a')).toBe(4);
    expect(si('a := mod(5, 3)', 'a')).toBe(2);
  });
});

describe('a function of the sheet on a series', () => {
  it('goes through a body that takes numbers only', () => {
    expect(list('F(x) := integral(t, t: 0 .. x)\na := F([1, 2])', 'a')[1]).toBeCloseTo(2, 10);
  });

  it('leaves a body that reads the series as a whole', () => {
    expect(si('w(v) := sum([1, 2, 3]·v)\na := w([1, 2, 3])', 'a')).toBe(14);
  });

  it('each(f, v) goes item by item always', () => {
    const data = 'x := [55, 54, 52, 52, 50]\ncount(a) := sum(if(x < a, 1, 0))\n';
    expect(list(`${data}r := each(count, x)`, 'r')).toEqual([4, 3, 1, 1, 0]);
  });

  it('each says what it needs', () => {
    expect(codes('a := each(1, [1, 2])')).toContain('E-TYPE');
    expect(codes('f(x) := x\na := each(f, 1)')).toContain('E-TYPE');
  });
});

describe('rounding in the unit of the value', () => {
  it('rounds an amount, as the law on depreciation asks (33 334 Kč)', () => {
    const sheet = 'a := ceil(100000 CZK/3)\nb := round(5.5 CZK)\nc := floor(5.5 CZK)';
    expect(si(sheet, 'a')).toBe(33334);
    expect(unit(sheet, 'a')).toBe('CZK');
    expect(si(sheet, 'b')).toBe(6);
    expect(si(sheet, 'c')).toBe(5);
  });

  it('rounds in the unit shown, not in SI', () => {
    expect(si('a := round(1234 mm)', 'a')).toBeCloseTo(1.234, 12);
    expect(unit('a := round(12.6 mm)', 'a')).toBe('mm');
    expect(si('a := round(12.6 mm)', 'a')).toBeCloseTo(0.013, 12);
    expect(si('a := round(1.234 m, 1)', 'a')).toBeCloseTo(1.2, 12);
    expect(si('a := ceil(1.21 m, 1)', 'a')).toBeCloseTo(1.3, 12);
  });

  it('rounds a temperature on its own scale', () => {
    const t = run('a := round(25.6 °C)').statements[0]!;
    expect(t.display?.unit).toBe('°C');
    expect(t.display?.value).toBeCloseTo(26, 9);
  });

  it('keeps what it did for plain numbers', () => {
    expect(si('a := floor((0.7 + 0.1)·10)', 'a')).toBe(8);
    expect(si('a := round(2.567, 2)', 'a')).toBeCloseTo(2.57, 12);
    expect(codes('a := round(2.5, 1.5)')).toContain('E-DOMAIN');
  });

  it('goes through a series of amounts', () => {
    expect(list('a := ceil([1.2, 2.5] CZK)', 'a')).toEqual([2, 3]);
  });
});

describe('functions of a whole series', () => {
  it('sort keeps the unit', () => {
    const sheet = 'a := sort([3, 1, 2] kN)';
    expect(list(sheet, 'a')).toEqual([1000, 2000, 3000]);
  });

  it('ranks shares places among equal items (VŠB 8.5: the rank 11.5)', () => {
    const a = '[55, 54, 58, 61, 52, 60, 53, 65, 52, 50, 51, 51, 49, 47, 53, 49, 50, 46, 48, 50]';
    const r = list(`r := ranks(${a})`, 'r');
    expect(r[4]).toBe(11.5);
    expect(r.reduce((s, v) => s + v, 0)).toBe(210);
    expect(list('r := ranks([10, 20, 20])', 'r')).toEqual([1, 2.5, 2.5]);
  });

  it('quantile as R and NumPy', () => {
    // Sorted 1, 2, 3, 4, 10: the place 0.9·4 = 3.6 lies between 4 and 10, so 7.6 (R type 7, the default of R and NumPy).
    expect(list('q := quantile([10, 1, 3, 2, 4], [0.25, 0.5, 0.9])', 'q')[2]).toBeCloseTo(7.6, 12);
    expect(si('q := quantile([1, 2, 3, 4, 10], 0.25)', 'q')).toBe(2);
    expect(codes('q := quantile([1, 2], 1.5)')).toContain('E-DOMAIN');
  });

  it('prod, cumprod, diff', () => {
    expect(si('p := prod([2, 3, 4])', 'p')).toBe(24);
    expect(si('p := prod([2, 3] m)', 'p')).toBe(6);
    expect(unit('p := prod([2, 3] m)', 'p')).toBe('m²');
    expect(list('p := cumprod([2, 3, 4])', 'p')).toEqual([2, 6, 24]);
    expect(codes('p := cumprod([2, 3] m)')).toContain('E-FUNC-ARG-DIM');
    expect(list('d := diff([1, 4, 9] m)', 'd')).toEqual([3, 5]);
  });

  it('diff of temperatures gives differences', () => {
    const sheet = 'd := diff([20, 25] °C)\nT := 300 K + d[1]';
    expect(list(sheet, 'd')[0]).toBeCloseTo(5, 9);
    expect(codes(sheet)).toEqual([]);
  });

  it('trapz and cumtrapz', () => {
    expect(si('a := trapz([0, 1, 2] s, [0, 2, 2] m/s)', 'a')).toBe(3);
    expect(si('a := trapz([1, 2, 3])', 'a')).toBe(4);
    expect(list('a := cumtrapz([0, 1, 2] s, [0, 2, 2] m/s)', 'a')).toEqual([0, 1, 3]);
    expect(unit('a := trapz([0, 1] m, [2, 2] kN/m)', 'a')).toBe('kN');
    expect(codes('a := trapz([0, 1], [1, 2, 3])')).toContain('E-VECTOR-LENGTH');
  });

  it('linspace, log2', () => {
    expect(list('a := linspace(0 m, 2 m, 5)', 'a')).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(codes('a := linspace(0, 1, 1)')).toContain('E-DOMAIN');
    expect(si('a := log2(8)', 'a')).toBe(3);
    expect(list('a := log2([2, 4])', 'a')).toEqual([1, 2]);
  });
});

describe('variance, covariance, correlation', () => {
  it('var is the square of stdev', () => {
    expect(si('v := var([2, 4, 4, 4, 5, 5, 7, 9])', 'v')).toBeCloseTo(32 / 7, 12);
    expect(unit('v := var([1, 2, 3] m)', 'v')).toBe('m²');
    expect(codes('v := var(range(1, 1))')).toContain('E-DOMAIN');
  });

  it('cov and corr of two series, worked by hand', () => {
    const [x, y] = ['[1, 2, 3, 4, 5]', '[2, 4, 5, 4, 5]'];
    expect(si(`c := cov(${x}, ${y})`, 'c')).toBeCloseTo(1.5, 12);
    expect(si(`c := corr(${x}, ${y})`, 'c')).toBeCloseTo(0.7745966692, 9);
    expect(codes('c := corr([1, 2], [1, 2, 3])')).toContain('E-VECTOR-LENGTH');
    expect(codes('c := corr([1, 1], [1, 2])')).toContain('E-DOMAIN');
  });

  it('Spearman is corr of ranks', () => {
    // By hand: ranks of y are [1, 2, 3.5, 5, 3.5], so r = 8/√(10·9.5).
    expect(si('c := corr(ranks([1, 2, 3, 4, 5]), ranks([5, 6, 7, 8, 7]))', 'c')).toBeCloseTo(8 / Math.sqrt(95), 12);
  });

  it('of a matrix: its columns', () => {
    const sheet = 'M := [1, 2 | 2, 3 | 3, 5]\nC := cov(M)\na := C[1, 2]\nt := trace(C)\nR := corr(M)\nb := R[1, 1]';
    expect(si(sheet, 'a')).toBeCloseTo(1.5, 12);
    expect(si(sheet, 't')).toBeCloseTo(1 + 7 / 3, 12);
    expect(si(sheet, 'b')).toBeCloseTo(1, 12);
  });
});

describe('min, max and where they are on a matrix', () => {
  // Five levels by three, as the 15 combinations of NIST HB 135, Example 7-4 (their least stands at E4, H3).
  const grid = 'C := [9, 8, 7 | 6, 5, 4 | 3, 2, 1 | 4, 5, 0.5 | 8, 9, 7]';

  it('finds the value', () => {
    expect(si(`${grid}\na := min(C)`, 'a')).toBe(0.5);
    expect(si(`${grid}\na := max(C)`, 'a')).toBe(9);
  });

  it('finds the place', () => {
    expect(list(`${grid}\na := argmin(C)`, 'a')).toEqual([4, 3]);
    expect(list(`${grid}\na := argmax(C)`, 'a')).toEqual([1, 1]);
    expect(si('a := argmin([5, 2, 2, 9])', 'a')).toBe(2);
    expect(si('a := argmax([5, 2, 9] m)', 'a')).toBe(3);
  });
});

describe('the coefficients of every kind of fit', () => {
  const t = '[0, 1, 2, 3, 4]';

  it('F[k] of an exponential, a power, a logarithm, in the order the curve is written', () => {
    // c = 2·e^(−0.5·t), exact, so the coefficients must come back.
    const exp = `t := ${t}\nc := 2·exp(-0.5·t)\nF := fit(c, x: t, kind: "exp")\na := F[1]\nb := F[2]`;
    expect(si(exp, 'a')).toBeCloseTo(2, 9);
    expect(si(exp, 'b')).toBeCloseTo(-0.5, 9);
    const power = 'x := [1, 2, 4, 8]\ny := 3·x^2\nF := fit(y, x: x, kind: "power")\na := F[1]\nb := F[2]';
    expect(si(power, 'a')).toBeCloseTo(3, 9);
    expect(si(power, 'b')).toBeCloseTo(2, 9);
    const log = 'x := [1, 2, 4, 8]\ny := 1 + 2·ln(x)\nF := fit(y, x: x, kind: "log")\na := F[1]\nb := F[2]';
    expect(si(log, 'a')).toBeCloseTo(1, 9);
    expect(si(log, 'b')).toBeCloseTo(2, 9);
  });

  it('a polynomial stays from the highest power down', () => {
    expect(si('x := [1, 2, 3]\np := polyfit(x, 2·x + 1, 1)\na := p[1]', 'a')).toBeCloseTo(2, 9);
  });

  it('a form of one\'s own in the order written', () => {
    const sheet = 't := [0, 1, 2, 3]\ny := 5 + 2·sin(t)\nF := fit(y, x: t, form: [1, sin(t)])\na := F[1]\nb := F[2]';
    expect(si(sheet, 'a')).toBeCloseTo(5, 9);
    expect(si(sheet, 'b')).toBeCloseTo(2, 9);
  });
});

describe('how good a fit is', () => {
  // Wikipedia, Simple linear regression: height and weight. β = 61.272, α = −39.062, s_β = 1.776, s_α = 2.938, s² = 0.5762.
  const data = `h := [1.47, 1.50, 1.52, 1.55, 1.57, 1.60, 1.63, 1.65, 1.68, 1.70, 1.73, 1.75, 1.78, 1.80, 1.83]
w := [52.21, 53.12, 54.48, 55.84, 57.20, 58.57, 59.93, 61.29, 63.11, 64.47, 66.28, 68.10, 69.92, 72.19, 74.46]
F := polyfit(h, w, 1)
`;

  it('reproduces the printed regression', () => {
    const se = list(`${data}e := fit_se(F)`, 'e');
    expect(se[0]).toBeCloseTo(1.776, 3);
    expect(se[1]).toBeCloseTo(2.938, 3);
    expect(si(`${data}s := fit_s(F)`, 's') ** 2).toBeCloseTo(0.5762, 3);
    expect(si(`${data}r := fit_r2(F)`, 'r')).toBeCloseTo(0.9946 ** 2, 3);
    expect(si(`${data}r := corr(h, w)`, 'r')).toBeCloseTo(0.9946, 4);
  });

  it('gives the errors in the units of the coefficients', () => {
    const sheet = 'x := [1, 2, 3, 4] s\ny := [2.1, 3.9, 6.2, 7.8] m\nF := fit(y, x: x)\ne := fit_se(F)\ns := fit_s(F)';
    expect(unit(sheet, 's')).toBe('m');
    const items = (run(sheet).values.get('e') as unknown as { items: { hint?: { symbol: string } }[] }).items;
    expect(items[0]!.hint?.symbol).toBe('m/s');
    expect(items[1]!.hint?.symbol).toBe('m');
  });

  it('a second degree polynomial, against the normal equations', () => {
    const sheet = 'x := [0, 1, 2, 3, 4, 5]\ny := [1.1, 2.9, 9.2, 19.1, 32.8, 51.2]\nF := polyfit(x, y, 2)\ne := fit_se(F)';
    const X = [0, 1, 2, 3, 4, 5];
    const Y = [1.1, 2.9, 9.2, 19.1, 32.8, 51.2];
    const A = X.map((v) => [v * v, v, 1]);
    const N = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.reduce((s, r) => s + r[i]! * r[j]!, 0)));
    const b = [0, 1, 2].map((i) => A.reduce((s, r, k) => s + r[i]! * Y[k]!, 0));
    const inv = invert(N);
    const c = inv.map((row) => row.reduce((s, v, j) => s + v * b[j]!, 0));
    const r = A.map((row, k) => Y[k]! - row.reduce((s, v, j) => s + v * c[j]!, 0));
    const s2 = r.reduce((s, v) => s + v * v, 0) / 3;
    const e = list(sheet, 'e');
    [0, 1, 2].forEach((i) => expect(e[i]).toBeCloseTo(Math.sqrt(s2 * inv[i]![i]!), 8));
  });

  it('an exponential: the error of a from that of ln a', () => {
    const sheet = 't := [0, 1, 2, 3, 4]\nc := [2.02, 1.19, 0.75, 0.44, 0.27]\nF := fit(c, x: t, kind: "exp")\ne := fit_se(F)\na := F[1]\ns := fit_s(F)';
    expect(list(sheet, 'e')[0]! / si(sheet, 'a')).toBeGreaterThan(0);
    expect(si(sheet, 's')).toBeLessThan(0.05);
  });

  it('says there is nothing to tell when no degree of freedom is left', () => {
    expect(codes('p := polyfit([1, 2], [3, 5], 1)\ne := fit_se(p)')).toContain('E-DOMAIN');
    expect(codes('a := 1\ne := fit_se(a)')).toContain('E-TYPE');
  });
});

function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const d = a[c]![c]!;
    a[c] = a[c]!.map((v) => v / d);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      a[r] = a[r]!.map((v, k) => v - f * a[c]![k]!);
    }
  }
  return a.map((row) => row.slice(n));
}
