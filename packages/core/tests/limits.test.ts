/**
 * Limit tests: problems known to break numerical programs, each with a reference from outside Kalketa. A test passes
 * when the result is right (within its tolerance) or when Kalketa refuses with the true reason; a wrong number without
 * a warning or an error giving a false reason fails it.
 *
 * Known faults are written as `it.fails` with the right expectation: they pass while the fault lasts and fail once
 * it is fixed, so the fix turns them into ordinary tests. References: mpmath 1.3 at 30–50 digits, exact fractions,
 * or the literature named at each case (computed 2026-11-09).
 */
import { describe, expect, it } from 'vitest';
import { SheetSession, defaultRegistry, type SheetResult } from '../src/index.js';

const run = (source: string): SheetResult => new SheetSession({ registry: defaultRegistry }).update(source);
const value = (r: SheetResult, name: string) => {
  const v = r.values.get(name);
  return v?.type === 'quantity' ? v.si : Number.NaN;
};

/** Robertson's kinetics (1966): rates 0.04, 1e4 and 3e7, the classic stiff test (Hairer & Wanner, II.10). */
const robertson = (end: string) => `solve (a(t), b(t), c(t)): a′ == -0.04·a + 1e4·b·c, b′ == 0.04·a - 1e4·b·c - 3e7·b^2, c′ == 3e7·b^2 in 0 .. ${end}
    a(0) == 1, b(0) == 0, c(0) == 0
A := a(${end})
B := b(${end})
C := c(${end})
sum := A + B + C`;

// 3200 steps of three equations, several grids: seconds when the whole suite runs at once.
describe('stiff equations', { timeout: 30_000 }, () => {
  it('Robertson to t = 0.1: right, and A + B + C stays 1', () => {
    const r = run(robertson('0.1'));
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // RK4 with 4e5 steps (h·|λ| ≤ 5e-4), settled to ten digits: 0.9960777474, 3.580437235e-5, 0.003886448185.
    expect(value(r, 'A')).toBeCloseTo(0.9960777474, 7);
    expect(value(r, 'B') / 3.580437235e-5).toBeCloseTo(1, 5);
    expect(value(r, 'C') / 0.003886448185).toBeCloseTo(1, 5);
    expect(value(r, 'sum')).toBeCloseTo(1, 12);
  });

  it('Robertson to t = 40: said to be stiff, not a fault of the equations', () => {
    // Hairer & Wanner give A = 0.7158271, B = 9.185535e-6, C = 0.2841637 at t = 40; a fixed step cannot get there.
    const codes = run(robertson('40')).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
    expect(codes).toEqual(['E-ODE-STIFF']);
  });

  it('Van der Pol: μ = 10 solved, μ = 100 said to be stiff', () => {
    const vdp = (mu: number, end: number) => `mu := ${mu}\nsolve y(t): y″ == mu·(1 - y^2)·y′ - y in 0 .. ${end}\n    y(0) == 2, y′(0) == 0\nY := y(${end})`;
    // SciPy (Radau, rtol 1e-10): y(50) = −1.837907 for μ = 10.
    expect(value(run(vdp(10, 50)), 'Y')).toBeCloseTo(-1.837907, 2);
    expect(run(vdp(100, 300)).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual(['E-ODE-STIFF']);
  });

  it('a pole is the end of the solution, not stiffness', () => {
    const codes = (source: string) => run(source).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
    expect(codes('solve p(x): p′ == p^2 in 0 .. 2\n    p(0) == 1')).toEqual(['E-ODE-SINGULAR']);
    expect(codes('solve (u(x), v(x)): u′ == u^2, v′ == -v in 0 .. 2\n    u(0) == 1, v(0) == 1')).toEqual(['E-ODE-SINGULAR']);
  });
});

const errors = (r: SheetResult) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const warned = (r: SheetResult) => r.diagnostics.some((d) => d.severity === 'warning');

describe('floating point', { timeout: 30_000 }, () => {
  it('a sum of a million terms of 1/k² (π²/6 − ζ(2, 10⁶ + 1) = 1.64493306684873)', () => {
    expect(value(run('s := sum(1/k^2, k: 1 .. 1000000)'), 's')).toBeCloseTo(1.64493306684873, 11);
  });

  it.fails('Rump’s example (−0.827396059946821) is not given as 1.1726 without a word', () => {
    const r = run('a := 77617\nb := 33096\nf := 333.75·b^6 + a^2·(11·a^2·b^2 - b^6 - 121·b^4 - 2) + 5.5·b^8 + a/(2·b)');
    expect(Math.abs(value(r, 'f') + 0.827396059946821) < 1e-6 || warned(r) || errors(r).length > 0).toBe(true);
  });

  it('(1 + 1/n)ⁿ for n = 10¹⁵ is e (2.71828…), or said to have lost its digits', () => {
    const r = run('e15 := (1 + 1/1e15)^1e15');
    expect(Math.abs(value(r, 'e15') - Math.E) < 1e-6 || warned(r)).toBe(true);
  });

  it.fails('Muller’s recurrence goes to 5 (exact fractions: x₃₀ = 4.99999956), not to 100', () => {
    const r = run('n := 30\ntable M: {rows=1..n}\n    | k | p = prev(q, 4.25) | q = 108 - (815 - 1500/prev(p, 4))/prev(q, 4.25) |\nx := M.q[30]');
    expect(Math.abs(value(r, 'x') - 5) < 1e-3 || warned(r)).toBe(true);
  });
});

describe('integrals', { timeout: 30_000 }, () => {
  it('an oscillating integral to infinity is refused for the right reason (∫ sin x/x = π/2)', () => {
    expect(errors(run('s := integral(sin(x)/x, x: 0 .. ∞)'))).toEqual(['E-INTEGRAL-DIVERGES']);
  });

  it('cos(1/x) near zero: an estimate, said so, within 1e-3 (∫₁^∞ cos t/t² dt = −0.0844109505595739)', () => {
    const r = run('w := integral(cos(1/x), x: 0 .. 1)');
    expect(warned(r)).toBe(true);
    expect(value(r, 'w')).toBeCloseTo(-0.0844109505595739, 3);
  });

  it.fails('x^−0.999 from 0 to 1 is 1000, not 34 called an estimate', () => {
    const r = run('n := integral(x^-0.999, x: 0 .. 1)');
    expect(Math.abs(value(r, 'n') - 1000) < 1 || errors(r).length > 0).toBe(true);
  });

  it.fails('a narrow peak is not missed (√π·10⁻⁴ = 1.77245385090552e-4)', () => {
    const r = run('p := integral(exp(-((x - 0.37)/1e-4)^2), x: 0 .. 1)');
    expect(Math.abs(value(r, 'p') / 1.77245385090552e-4 - 1) < 1e-6 || warned(r)).toBe(true);
  });
});

describe('roots', { timeout: 30_000 }, () => {
  it('Wilkinson’s polynomial, as a product: every root within 1e-2 (largest 7.7e-3 at 14; NumPy roots of the same coefficients: 8e-2)', () => {
    const product = Array.from({ length: 20 }, (_, i) => `(x - ${i + 1})`).join('·');
    const v = run(`w := roots(${product}, x)`).values.get('w');
    const roots = v?.type === 'vector' ? v.items.map((q) => q.si) : [];
    expect(roots).toHaveLength(20);
    roots.forEach((r, i) => expect(Math.abs(r - (i + 1))).toBeLessThan(1e-2));
  });

  it('a jump of tan x is no root', () => {
    expect(errors(run('solve t: tan(t) == 0 in 1 .. 2'))).toEqual(['E-SOLVE-NO-ROOT']);
  });

  it.fails('a fivefold root (x − 1)⁵ is 1 five times, or its spread is said', () => {
    const r = run('r := roots((x - 1)^5, x)');
    const v = r.values.get('r');
    const spread = v?.type === 'vector' ? Math.max(...v.items.map((q) => Math.hypot(q.si - 1, q.im ?? 0))) : Infinity;
    expect(spread < 1e-6 || warned(r)).toBe(true);
  });

  it('x^0 is a term of a polynomial', () => {
    expect(errors(run('r := roots(x^2 - 3·x + 2·x^0, x)'))).toEqual([]);
  });
});

describe('special functions and the range of numbers', () => {
  it('gamma away from and at its poles (mpmath)', () => {
    expect(value(run('g := gamma(-1.5)'), 'g')).toBeCloseTo(2.36327180120735, 12);
    expect(errors(run('g := gamma(-2)'))).toEqual(['E-DOMAIN']);
    expect(value(run('g := gamma(171.6)'), 'g') / 1.5858969096673e308).toBeCloseTo(1, 10);
    expect(value(run('g := gamma(1e-10)'), 'g') / 9999999999.42278).toBeCloseTo(1, 12);
  });

  it('erfc(10) and Bessel functions of large arguments (mpmath)', () => {
    expect(value(run('c := erfc(10)'), 'c') / 2.08848758376254e-45).toBeCloseTo(1, 12);
    expect(value(run('j := besselj(0, 1000)'), 'j')).toBeCloseTo(0.0247866861524202, 13);
    expect(value(run('j := besselj(0, 100000)'), 'j')).toBeCloseTo(-0.00171920111623597, 13);
  });

  it('overflow is an error, underflow a warning', () => {
    expect(errors(run('o := exp(710)'))).toEqual(['E-NOT-FINITE']);
    expect(warned(run('o := exp(-746)'))).toBe(true);
  });

  it('erfc(30) (2.6e-393) below the range is said, as exp(−746) is', () => {
    expect(warned(run('c := erfc(30)'))).toBe(true);
  });

  it('light years and units far apart', () => {
    expect(value(run('L := 1 ly'), 'L')).toBe(9460730472580800);
    expect(value(run('L := 1e-30 m'), 'L')).toBe(1e-30);
  });
});

describe('linear algebra', { timeout: 30_000 }, () => {
  it('Wilkinson’s W21⁺: the two largest eigenvalues, 7e-14 apart (mpmath eigsy)', () => {
    const rows = Array.from({ length: 21 }, (_, i) => Array.from({ length: 21 }, (__, j) => (i === j ? Math.abs(10 - i) : Math.abs(i - j) === 1 ? 1 : 0)).join(', '));
    const v = run(`W := [${rows.join(' | ')}]\nl := eigenvals(W)`).values.get('l');
    const sorted = v?.type === 'vector' ? v.items.map((q) => q.si).sort((a, b) => a - b) : [];
    expect(sorted.at(-1)).toBeCloseTo(10.746194182903393, 12);
    expect(sorted.at(-2)).toBeCloseTo(10.746194182903322, 12);
  });

  it('units 24 orders apart solve exactly (u₁ = (5e-12 − 2)/11 m, u₂ = (3e12 − 2)/11)', () => {
    const r = run('K := [3e12 N/m, 2 N | 2 N, 5e-12 N·m]\nF := [1 N | 1 N·m]\nu := lsolve(K, F)');
    const u = r.values.get('u');
    const items = u?.type === 'vector' || u?.type === 'matrix' ? u.items.map((q) => q.si) : [];
    expect(items[0]).toBeCloseTo((5e-12 - 2) / 11, 14);
    expect(items[1]! / ((3e12 - 2) / 11)).toBeCloseTo(1, 12);
    expect(r.diagnostics).toEqual([]);
  });

  it('cond of a matrix in very different units is not called past double precision', () => {
    // Its rows and columns scaled, the matrix is about [1, 0.5 | 0.5, 1]: cond near 3. In SI numbers it is 8e23.
    const r = run('K := [3e12 N/m, 2 N | 2 N, 5e-12 N·m]\nc := cond(K)');
    expect(r.diagnostics.map((d) => d.code)).not.toContain('W-COND-BEYOND-DOUBLE');
    // Its rows and then columns scaled to 1, as lsolve solves it: about 4, depending on the scaling, never 8e23.
    expect(value(r, 'c')).toBeLessThan(10);
  });

  it('a number written with 30 places is shown with the 15 digits it holds', () => {
    const d = run('T := 17.0652165601579625588917206249').statements[0]!.display!;
    expect(d.value).toBeCloseTo(17.0652165601579625588917206249, 13);
  });
});

describe('ODE beyond stiffness', { timeout: 60_000 }, () => {
  it('Lorenz to t = 10 (mpmath Taylor, 30 digits: x(5) = −6.51211369942, x(10) = −4.90268754113)', () => {
    const r = run('solve (x(t), y(t), z(t)): x′ == 10·(y - x), y′ == x·(28 - z) - y, z′ == x·y - 8/3·z in 0 .. 10\n    x(0) == 1, y(0) == 1, z(0) == 1\nA := x(5)\nB := x(10)');
    expect(value(r, 'A')).toBeCloseTo(-6.51211369942, 4);
    expect(value(r, 'B')).toBeCloseTo(-4.90268754113, 3);
  });

  it('a jump in the right side: the right value, with a warning', () => {
    const r = run('solve s(t): s′ == sign(1 - t) in 0 .. 2\n    s(0) == 0\nA := s(1)\nB := s(2)');
    expect(value(r, 'A')).toBeCloseTo(1, 3);
    expect(value(r, 'B')).toBeCloseTo(0, 6);
    expect(warned(r)).toBe(true);
  });

  it('Van der Pol μ = 1000, Oregonator and E5 are said to be stiff', () => {
    expect(errors(run('m := 1000\nsolve v(t): v″ == m·(1 - v^2)·v′ - v in 0 .. 3000\n    v(0) == 2, v′(0) == 0'))).toEqual(['E-ODE-STIFF']);
    expect(errors(run('solve (a(t), b(t), c(t)): a′ == 77.27·(b + a·(1 - 8.375e-6·a - b)), b′ == (c - (1 + a)·b)/77.27, c′ == 0.161·(a - c) in 0 .. 360\n    a(0) == 1, b(0) == 2, c(0) == 3'))).toEqual(['E-ODE-STIFF']);
    expect(errors(run('solve (a(t), b(t), c(t), d(t)): a′ == -7.89e-10·a - 1.1e7·a·c, b′ == 7.89e-10·a - 1.13e15·b·c, c′ == 7.89e-10·a - 1.1e7·a·c - 1.13e15·b·c + 1.13e3·d, d′ == 1.1e7·a·c - 1.13e3·d in 0 .. 1000\n    a(0) == 1.76e-3, b(0) == 0, c(0) == 0, d(0) == 0'))).toEqual(['E-ODE-STIFF']);
  });

  it.fails('the Arenstorf orbit closes after one period (x(T) = 0.994, y(T) = 0), not 0.18 off', () => {
    const r = run('μ := 0.012277471\nν := 1 - μ\nT := 17.0652165601579625588917206249\nsolve (x(t), y(t)): x″ == x + 2·y′ - ν·(x + μ)/((x + μ)^2 + y^2)^1.5 - μ·(x - ν)/((x - ν)^2 + y^2)^1.5, y″ == y - 2·x′ - ν·y/((x + μ)^2 + y^2)^1.5 - μ·y/((x - ν)^2 + y^2)^1.5 in 0 .. T\n    x(0) == 0.994, x′(0) == 0, y(0) == 0, y′(0) == -2.00158510637908252240537862224\nY := y(T)');
    expect(Math.abs(value(r, 'Y'))).toBeLessThan(1e-3);
  });
});

describe('size and time', { timeout: 60_000 }, () => {
  it('a chain of 10 000 lines', () => {
    const lines = ['x0 := 1 m', ...Array.from({ length: 10000 }, (_, i) => `x${i + 1} := x${i} + 1 mm`)];
    expect(value(run(lines.join('\n')), 'x10000')).toBeCloseTo(11, 9);
  });

  it('a 200 × 200 system solved to its rounding', () => {
    const r = run('A := matrix(1/(i + j) + 200·(1 - sign(abs(i - j))), i: 1 .. 200, j: 1 .. 200)\nb := vector(1, i: 1 .. 200)\nx := lsolve(A, b)\nr := max(abs(A·x - b))');
    expect(value(r, 'r')).toBeLessThan(1e-12);
  });
});

describe('incremental recalculation', () => {
  it('a line read otherwise once a name is defined is calculated again (q·L^2: litre, then length)', () => {
    const session = new SheetSession({ registry: defaultRegistry });
    const sheet = 'L := 6 m\nq := 12 kN/m\nM := q·L^2/8';
    session.update(sheet.split('\n').slice(1).join('\n'));
    const again = session.update(sheet);
    const fresh = run(sheet);
    expect(again.statements[2]!.display).toEqual(fresh.statements[2]!.display);
    expect(again.statements[2]!.display!.unit).toBe('kN·m');
  });
});

describe('nesting', { timeout: 60_000 }, () => {
  it('a chain of 2000 functions each calling the one before is an error of its line, not the end of the sheet', () => {
    const chain = Array.from({ length: 2000 }, (_, i) => `f${i + 1}(x) := ${i === 0 ? 'x' : `f${i}(x)`} + 1`).join('\n');
    const r = run(`${chain}\na := f2000(1)\nb := 2`);
    expect(r.statements.at(-2)!.diagnostics.map((d) => d.code)).toEqual(['E-EXPR-DEPTH']);
    expect(value(r, 'b')).toBe(2);
  });

  it('brackets 100 000 deep are refused by the parser, not by the stack', () => {
    expect(errors(run(`a := ${'('.repeat(100000)}1${')'.repeat(100000)}`))).toEqual(['E-EXPR-DEPTH']);
  });
});

describe('units at their edges', () => {
  const shown = (source: string) => {
    const d = run(source).statements.at(-1)!.display!;
    return `${Number(d.value.toPrecision(6))} ${d.unit}`;
  };

  it('a conductivity in W/(m·°C) times a difference gives W/m², not kg/s³', () => {
    expect(shown('λ := 0.5 W/(m·°C)\nq := λ·(20 °C - 5 °C)/(0.2 m)')).toBe('37.5 W/m²');
    expect(shown('h := 10 W/(m²·K)\nq := h·(80 °C - 20 °C)')).toBe('600 W/m²');
    expect(shown('λ := 0.5 W/(m·°C)\nq := λ·15 K')).toBe('7.5 W/m');
    expect(shown('g := 2 °C/m\nd := g·3 m')).toBe('6 Δ°C');
    expect(shown('c := 4180 J/(kg·°C)\nQ := 2 kg·c·(60 °C - 20 °C)')).toBe('334400 J');
  });

  it('temperatures, angles and rotation (exact conversions)', () => {
    expect(shown('t := 300 K | °C')).toBe('26.85 °C');
    expect(shown('t := 100 °F | °C')).toBe('37.7778 °C');
    expect(shown('t := 10 Δ°F | K')).toBe('5.55556 K');
    expect(value(run('d := derivative(sin(x), x: 30°)'), 'd')).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(value(run('i := integral(sin(x), x: 0° .. 90°)'), 'i')).toBeCloseTo(1, 12);
    expect(shown('w := 1 Hz | rad/s')).toBe('6.28319 rad/s');
    expect(shown('n := 2·π·50 Hz | rpm')).toBe('3000 rpm');
  });

  it('a g never defined is a gram, and said so', () => {
    expect(run('m := 3 kg\nF := m·g').diagnostics.map((d) => d.code)).toContain('W-BARE-UNIT');
  });
});

describe('the nonlinear solver', () => {
  const solved = (source: string) => {
    const r = run(source);
    const s = r.statements.at(-1)!;
    return { codes: r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code), values: (s.solutions ?? []).map((x) => x.value.si) };
  };

  it('double and triple roots, a root at the end, a cycling Newton, Lambert W', () => {
    expect(solved('solve x: (x - 2)^2 == 0 in 0 .. 5').values[0]).toBeCloseTo(2, 6);
    expect(solved('solve x: (x - 1)^3 == 0 in 0 .. 3').values[0]).toBeCloseTo(1, 4);
    expect(solved('solve x: x^2 == 4 in 2 .. 5').values[0]).toBeCloseTo(2, 12);
    expect(solved('solve x: x^3 - 2·x + 2 == 0 guess x = 0').values[0]).toBeCloseTo(-1.76929235423863, 10);
    expect(solved('solve w: w·exp(w) == 1').values[0]).toBeCloseTo(0.567143290409784, 12);
  });

  it('jumps and poles are no roots; scales 18 orders apart', () => {
    expect(solved('solve x: 1/x == 0 in -1 .. 1').codes).toEqual(['E-SOLVE-NO-ROOT']);
    expect(solved('solve x: floor(x) == 2.5 in 0 .. 5').codes).toEqual(['E-SOLVE-NO-ROOT']);
    const s = solved('solve (a, b): a·1e9 == 3, b·1e-9 == 4').values;
    expect(s[0]! / 3e-9).toBeCloseTo(1, 10);
    expect(s[1]! / 4e9).toBeCloseTo(1, 10);
  });

  it('exp(x) == 0 has no root, not x = −1000 where exp underflows', () => {
    expect(solved('solve x: exp(x) == 0').codes).toEqual(['E-SOLVE-UNDERFLOW']);
  });

  it('equations that contradict each other or repeat have no single solution', () => {
    expect(solved('solve (x, y): x + y == 1, x + y == 2').codes).toEqual(['E-SOLVE-SINGULAR']);
    expect(solved('solve (x, y): x + y == 1, 2·x + 2·y == 2').codes).toEqual(['E-SOLVE-SINGULAR']);
  });
});

describe('tables', () => {
  it('a key twice in the column is an error, not a value between two of its rows', () => {
    const r = run('table D:\n    | x | y |\n    | 1 | 10 |\n    | 1 | 99 |\n    | 2 | 20 |\nv := interpolate(D, x: 1.5).y');
    expect(errors(r)).toEqual(['E-TABLE-INTERPOLATE']);
  });

  it('read backwards along a column that goes up and down, it warns', () => {
    const r = run('table Q:\n    | x | y |\n    | 1 | 10 |\n    | 2 | 30 |\n    | 3 | 20 |\nv := interpolate(Q, y: 25).x');
    expect(r.diagnostics.map((d) => d.code)).toContain('W-TABLE-NOT-MONOTONIC');
  });

  it('an unsorted table is no warning', () => {
    const r = run('table U:\n    | x | y |\n    | 3 | 30 |\n    | 1 | 10 |\n    | 2 | 20 |\nv := interpolate(U, x: 1.5).y');
    expect(value(r, 'v')).toBe(15);
    expect(r.diagnostics).toEqual([]);
  });
});

describe('names that look alike', () => {
  it('a Cyrillic а beside a Latin a is warned of', () => {
    const r = run('a := 1\nа := 5');
    expect(r.diagnostics.map((d) => [d.code, d.params['other']])).toEqual([['W-LOOKALIKE-NAME', 'a']]);
  });

  it('the micro sign of the keyboard is the Greek μ; NFD letters are NFC ones', () => {
    expect(value(run('μ := 4\nr := µ + 1'), 'r')).toBe(5);
    expect(value(run('délka := 3\nr := de\u0301lka + 1'), 'r')).toBe(4);
  });

  it('an invisible character is named by its code', () => {
    const d = run('b := 2\nr := b\u200b + 1').diagnostics.find((x) => x.code === 'E-UNEXPECTED-CHAR')!;
    expect(d.params['char']).toBe('U+200B');
  });
});
