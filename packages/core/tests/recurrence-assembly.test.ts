import { describe, expect, it } from 'vitest';
import { evaluateSheet } from '../src/index.js';

/** Stage 3 of docs/navrhy/VYBER-VZORU.md: a column reads the row above, tables from a range, matrices put together. */
const run = (source: string) => evaluateSheet(source);
const codes = (source: string) => run(source).diagnostics.map((d) => d.code);

function values(source: string) {
  const result = run(source);
  expect(result.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.code} ${d.span.line}`)).toEqual([]);
  return result.values;
}

function si(env: ReadonlyMap<string, unknown>, name: string): number {
  return (env.get(name) as { si: number }).si;
}

describe('a column reads the row above', () => {
  it('a loan schedule: 5000 at 9 %/year over 12 months, total interest 247.09 (checked against the closed form)', () => {
    const env = values(`P := 5000
r := 0.09/12
n := 12
pay := P·r/(1 - (1 + r)^(-n))
table S: {rows=1..n}
    | k | i = prev(B, P)·r | B = prev(B, P)·(1 + r) - pay |
total := sum(S.i)
last := S.B[12]
b_6 := S.B[6]
`);
    expect(si(env, 'pay')).toBeCloseTo(437.26, 2);
    expect(si(env, 'total')).toBeCloseTo(12 * si(env, 'pay') - 5000, 9);
    expect(si(env, 'total')).toBeCloseTo(247.09, 2);
    expect(si(env, 'last')).toBeCloseTo(0, 8);
    expect(si(env, 'b_6')).toBeCloseTo(2556.03, 2);
  });

  it('a cell filled by hand is the start: Euler for dp/dx = 0.5 x (1 - x), p(0) = 2, h = 1: p(2) = 2 (TheoremQA 393)', () => {
    const env = values(`h := 1
table E: {rows=0..2}
    | n | x = n·h | p = prev(p) + h·0.5·prev(x)·(1 - prev(x)) |
    | 0 |         | 2                                          |
p_2 := E.p[3]
`);
    expect(si(env, 'p_2')).toBeCloseTo(2, 12);
  });

  it('reads a column to its right in the row above: Fibonacci', () => {
    const env = values(`table F: {rows=10}
    | k | a = prev(a, 0) + prev(b, 1) | b = prev(a, 0) |
x := F.a[10]
`);
    expect(si(env, 'x')).toBe(55);
  });

  it('bisection for x^3 - x - 2 in 1 .. 2 reaches 1.5213797 (the root by Newton)', () => {
    const env = values(`f(x) := x^3 - x - 2
table B: {rows=40}
    | k | a = if(f(prev(c, 1.5))·f(prev(a, 1)) < 0, prev(a, 1), prev(c, 1.5)) | b = if(f(prev(c, 1.5))·f(prev(a, 1)) < 0, prev(c, 1.5), prev(b, 2)) | c = (a + b)/2 |
x := B.c[40]
`);
    expect(si(env, 'x')).toBeCloseTo(1.5213797068, 9);
  });

  it('keeps units, and the unit of the header', () => {
    const env = values(`table T: {rows=3}
    | k | L [mm] = prev(L, 1 m) + 1 cm |
x := T.L[3]
`);
    expect(si(env, 'x')).toBeCloseTo(1.03, 12);
  });

  it('a long chain stays fast and finite', () => {
    const started = Date.now();
    const env = values(`table L: {rows=5000}
    | k | x = 3.7·prev(x, 0.5)·(1 - prev(x, 0.5)) |
y := L.x[5000]
`);
    expect(si(env, 'y')).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('says what is wrong', () => {
    expect(codes('x := prev(y)')).toContain('E-PREV-PLACE');
    expect(codes('table T: {rows=3}\n    | k | x = prev(x) + 1 |\n')).toContain('E-PREV-START');
    expect(codes('table T: {rows=3}\n    | k | x = prev(x + 1, 0) |\n')).toContain('E-PREV-FORM');
    expect(codes('table T: {rows=3}\n    | k | x = prev(y, 0) |\n')).toContain('E-TABLE-COLUMN');
    // One report for the column, not one for each row.
    expect(codes('table T: {rows=3}\n    | k | x = prev(x) + 1 |\n').length).toBe(1);
  });
});

describe('a table from a range', () => {
  it('a row for each number; rows by hand are the first; totals stay at the end', () => {
    const env = values(`n := 4
table T: {rows=0..n}
    | k | v = k^2 |
    | 0 | 7       |
    | Celkem | Σ  |
s := sum(T.v)
c := len(T.v)
`);
    expect(si(env, 'c')).toBe(5);
    expect(si(env, 's')).toBe(7 + 1 + 4 + 9 + 16);
  });

  it('{rows=n} counts from 1, the first column in its unit', () => {
    const env = values(`table T: {rows=3}
    | t [min] | d [s] = t |
x := T.d[3]
`);
    expect(si(env, 'x')).toBe(180);
  });

  it('project selection under a budget, NIST HB 135 Ex. 7-6: B, C, D, F, G; cost 1 150 000, savings 2 030 000', () => {
    const env = values(`c := [300, 200, 200, 250, 300, 100, 400, 1000]·1000
ns := [100, 800, 400, 350, 150, 180, 300, 1000]·1000
bit(s, k) := mod(floor(s/2^k), 2)
table V: {rows=0..255}
    | s | cena = sum(bit(s, k)·c[k + 1], k: 0 .. 7) | uspora = sum(bit(s, k)·ns[k + 1], k: 0 .. 7) |
best := find_max(V, by: uspora, where: r.cena <= 1200000)
u := best.uspora
m := best.cena
`);
    expect(si(env, 'u')).toBe(2030000);
    expect(si(env, 'm')).toBe(1150000);
  });

  it('every step of typing it is calculated without falling over', () => {
    const text = 'n := 3\ntable U: {rows=1..n}\n    | k | B [kN] {0.0} = prev(B, 100 kN)·2 |\n    | Celkem | Σ |\nx := U.B[3]';
    for (let end = 0; end <= text.length; end++) expect(() => run(text.slice(0, end))).not.toThrow();
  });

  it('wrong bounds are reported, not guessed', () => {
    expect(codes('table T: {rows=2.5}\n    | k | x = k |\n')).toContain('E-TABLE-ROWS');
    expect(codes('table T: {rows=5..1}\n    | k | x = k |\n')).toContain('E-TABLE-ROWS');
    expect(codes('table T: {rows=1000000}\n    | k | x = k |\n')).toContain('E-TABLE-ROWS');
    expect(codes('table T: {rows=3 m}\n    | k | x = k |\n').length).toBeGreaterThan(0);
  });
});

describe('matrices put together', () => {
  it('sum over matrices and series', () => {
    const env = values(`A := sum([k, 0 | 0, 2·k], k: 1 .. 3)
a := A[2, 2]
v := sum([k, 1], k: 1 .. 3)
b := v[2]
`);
    expect(si(env, 'a')).toBe(12);
    expect(si(env, 'b')).toBe(3);
  });

  it('matrix and vector from their indices; a one-column matrix is a series', () => {
    const env = values(`H := matrix(1/(i + j - 1), i: 1 .. 3, j: 1 .. 3)
h := H[2, 3]
d := det(H)
v := vector(i^2, i: 1 .. 4)
w := v[4]
c := matrix(i, i: 1 .. 2, j: 1 .. 1)
x := c[2]
`);
    expect(si(env, 'h')).toBeCloseTo(0.25, 14);
    expect(si(env, 'd')).toBeCloseTo(1 / 2160, 12);
    expect(si(env, 'w')).toBe(16);
    expect(si(env, 'x')).toBe(2);
  });

  it('a zero from a branch among items of one unit takes it', () => {
    const env = values(`K := matrix(if(i == j, 2 kN/m, 0), i: 1 .. 2, j: 1 .. 2)
u := lsolve(K, [2 kN, 4 kN])
x := u[2]
`);
    expect(si(env, 'x')).toBeCloseTo(2, 12);
  });

  it('a row times a column is a number', () => {
    const env = values(`b := [1, 2, 3]
x := transpose(b)·[4, 5, 6]
y := x + 1
`);
    expect(si(env, 'y')).toBe(33);
  });

  it('a six-bar truss, Roylance 2.1 pr. 7: 0.08438 in, stresses 4000 and -2828 psi', () => {
    const env = values(`E := 30e6 psi
A := 0.5 in^2
P := 1000 lbf
a := 100 in
r := 1/sqrt(2)
B := [1, 0, 0, 0, 0, 0 | -1, 0, 1, 0, 0, 0 | r, r, 0, 0, 0, 0 | 0, 1, 0, 0, 0, -1 | 0, 0, r, r, -r, -r | 0, 0, 0, 0, 1, 0]
L := [a, a, sqrt(2)·a, a, sqrt(2)·a, a]
b(e) := vector(B[e, d], d: 1 .. 6)
K := E·A·sum(b(e)·transpose(b(e))/L[e], e: 1 .. 6)
u := lsolve(K, [0 lbf, 0 lbf, 0 lbf, -P, 0 lbf, 0 lbf])
v_3 := u[4] | in
σ_1 := E/L[1]·transpose(b(1))·u | psi
σ_3 := E/L[3]·transpose(b(3))·u | psi
`);
    expect(si(env, 'v_3') / 0.0254).toBeCloseTo(-0.084375, 5);
    expect(Math.abs(si(env, 'σ_1')) / 6894.757293168).toBeCloseTo(4000, 3);
    expect(Math.abs(si(env, 'σ_3')) / 6894.757293168).toBeCloseTo(2828.43, 1);
  });

  it('scatter leaves out a fixed place, adds up a place named twice, takes a load vector', () => {
    const env = values(`K := scatter([1, 2 | 3, 4], [0, 2], 3)
a := K[2, 2]
b := K[1, 1]
L := scatter([1, 2 | 3, 4], [2, 2], 2)
c := L[2, 2]
f := scatter([5 N, 7 N], [3, 0], 3)
d := f[3]
e := f[1] + 1 N
`);
    expect(si(env, 'a')).toBe(4);
    expect(si(env, 'b')).toBe(0);
    expect(si(env, 'c')).toBe(10);
    expect(si(env, 'd')).toBe(5);
    expect(si(env, 'e')).toBe(1);
  });

  it('a cantilever of two elements with kN and kN·m: zeros between other units still solve, F·L³/3EI and F·L²/2EI', () => {
    const env = values(`E_I := 2000 kN·m^2
l := 2 m
k_e := E_I/l^3·[12, 6·l, -12, 6·l | 6·l, 4·l^2, -6·l, 2·l^2 | -12, -6·l, 12, -6·l | 6·l, 2·l^2, -6·l, 4·l^2]
K := sum(scatter(k_e, [max(2·e - 3, 0), max(2·e - 2, 0), 2·e - 1, 2·e], 4), e: 1 .. 2)
u := lsolve(K, [0 kN | 0 kN·m | 10 kN | 0 kN·m])
w := u[3]
φ := u[4]
`);
    expect(si(env, 'w')).toBeCloseTo((10 * 4 ** 3) / (3 * 2000), 10);
    expect(si(env, 'φ')).toBeCloseTo((10 * 4 ** 2) / (2 * 2000), 10);
  });

  it('a wall of 10 x 10 four-node elements, 220 unknowns (VSB MKP pr. 4.5): v = -2.8905e-6 m, the same mesh by NumPy', () => {
    const env = values(`p := 10
E := 10 GPa
ν := 0.2
t := 0.1 m
ρ := 1000 kg/m^3
g := 10 m/s^2
h := 1 m/p
D := E/(1 - ν^2)·[1, ν, 0 | ν, 1, 0 | 0, 0, (1 - ν)/2]
J := h/2
B(ξ, η) := [-(1 - η), 0, 1 - η, 0, 1 + η, 0, -(1 + η), 0 | 0, -(1 - ξ), 0, -(1 + ξ), 0, 1 + ξ, 0, 1 - ξ | -(1 - ξ), -(1 - η), -(1 + ξ), 1 - η, 1 + ξ, 1 + η, 1 - ξ, -(1 + η)]/(4·J)
Kg(ξ, η) := transpose(B(ξ, η))·D·B(ξ, η)·J^2·t
gp := 1/sqrt(3)
k_e := Kg(-gp, -gp) + Kg(gp, -gp) + Kg(gp, gp) + Kg(-gp, gp)
n := 2·p·(p + 1)
u_d(i, j) := if(i == 0, 0, 2·(j·p + i) - 1)
v_d(i, j) := if(i == 0, 0, 2·(j·p + i))
d(i, j) := [u_d(i, j), v_d(i, j), u_d(i + 1, j), v_d(i + 1, j), u_d(i + 1, j + 1), v_d(i + 1, j + 1), u_d(i, j + 1), v_d(i, j + 1)]
place(e) := d(mod(e - 1, p), floor((e - 1)/p))
K := sum(scatter(k_e, place(e), n), e: 1 .. p^2)
F := ρ·g·h^2·t/4
f_e := [0 N, -F, 0 N, -F, 0 N, -F, 0 N, -F]
f := sum(scatter(f_e, place(e), n), e: 1 .. p^2)
u := lsolve(K, f)
v_c := u[v_d(p, 0)] | m
`);
    expect(si(env, 'v_c')).toBeCloseTo(-2.8905080971473e-6, 12);
  }, 30000);

  it('a large system stays within the time of a line', () => {
    const started = Date.now();
    const env = values(`n := 240
K := sum(scatter([2, -1 | -1, 2], [e, e + 1], n), e: 1 .. n - 1)
f := vector(1, i: 1 .. n)
u := lsolve(K, f)
x := u[1]
`);
    // Diagonal 4 inside and 2 at the ends, -1 beside it, every load 1: u_i = 1/2 + c·λ^i with λ = 2 - √3, so u_1 = 1/2 + √3/6.
    expect(si(env, 'x')).toBeCloseTo(0.5 + Math.sqrt(3) / 6, 9);
    expect(Date.now() - started).toBeLessThan(15000);
  }, 30000);

  it('a large system of whole numbers is not solved in fractions: that would freeze the window', () => {
    const started = Date.now();
    const env = values(`n := 240
A := matrix(if(i == j, 2, if(i == j + 1 or j == i + 1, -1, 0)), i: 1 .. n, j: 1 .. n)
f := vector(1, i: 1 .. n)
u := lsolve(A, f)
x := u[1]
`);
    expect(si(env, 'x')).toBeCloseTo(120, 6);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30000);

  it('what does not fit is reported', () => {
    expect(codes('A := sum(if(k == 1, 1, 2)·[1, 2 | 3, 4] + 0, k: 1 .. 2)').length).toBeGreaterThan(0);
    expect(codes('B := scatter([1, 2 | 3, 4], [1, 5], 3)')).toContain('E-INDEX');
    expect(codes('B := scatter([1, 2, 3 | 4, 5, 6], [1, 2], 3)')).toContain('E-MATRIX-SHAPE');
    expect(codes('A := matrix(1, i: 1 .. 2)')).toContain('E-CALCULUS-FORM');
    expect(codes('A := sum([k·1 m, 0], k: 1 .. 1)\nC := sum([if(k == 1, 1 m, 1 s), 0], k: 1 .. 2)')).toContain('E-UNIT-MISMATCH');
  });
});
