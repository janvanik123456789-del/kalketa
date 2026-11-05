/**
 * Matrices and vectors (docs/03-jazyk.md, ch. 7.1d), after Calcpad's matrix
 * functions; units per item as in EngineeringPaper.xyz.
 *
 * The numbers are worked in SI. Units: det, inverse and lsolve need a matrix
 * whose item units are a row unit times a column unit (a stiffness matrix
 * with kN/m, kN and kN·m is one), which is what makes their results have
 * units at all; eigenvalues need one unit for the whole matrix.
 */

import { diagnostic, fail, type Span } from '../diagnostics.js';
import { DIMENSIONLESS, divideDims, isDimensionless, multiplyDims, powerDim, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type MatrixValue, type Quantity, type Value, type VectorValue } from '../values/value.js';
import { exact, solveLinear, type Exact } from '../values/exact.js';
import { complexDet, complexLu, complexSolve, eigenvalues, eigenvector, fractionOf, molarMass, singularValues, size, type C } from './general.js';
import type { Args, FunctionDef } from './registry.js';

/** The largest system lsolve also solves in exact fractions. */
const EXACT_SOLVE_SIZE = 12;
/** A solution loses this much of its 16 digits, so at most 5 are left: worth a word. */
const LOST_DIGITS_CONDITION = 1e11;
/** Above this the inverse that tells the condition number takes longer than the solution; a large mesh is seldom the case. */
const MAX_CONDITION_SIZE = 300;

// ---------------------------------------------------------------- building

export function matrix(rows: number, cols: number, items: readonly Quantity[]): MatrixValue {
  return { type: 'matrix', rows, cols, items };
}

/** A matrix with one column is a vector: A·v and lsolve give vectors. */
export function normalized(m: MatrixValue): MatrixValue | VectorValue {
  return m.cols === 1 ? { type: 'vector', items: m.items } : m;
}

export function at(m: MatrixValue, i: number, j: number): Quantity {
  return m.items[i * m.cols + j]!;
}

/** A matrix, or a vector taken as one column. */
export function asMatrix(value: Value, span: Span): MatrixValue {
  if (value.type === 'matrix') return value;
  if (value.type === 'vector') return matrix(value.items.length, 1, value.items);
  return fail('E-TYPE', span, { expected: 'matrix', found: value.type === 'quantity' ? 'number' : value.type });
}

function square(m: MatrixValue, span: Span, name: string): number {
  if (m.rows !== m.cols) fail('E-MATRIX-SQUARE', span, { function: name, rows: m.rows, cols: m.cols });
  return m.rows;
}

function pairs(m: MatrixValue): C[][] {
  return Array.from({ length: m.rows }, (_, i) => Array.from({ length: m.cols }, (_, j): C => [at(m, i, j).si, at(m, i, j).im ?? 0]));
}

/** A·x = b with complex numbers (coupled coils, an impedance matrix); units as in the real case. */
function complexLsolve(a: Args, m: MatrixValue, b: MatrixValue, rows: readonly Dimension[]): Value {
  const n = m.rows;
  const { cols } = structure(m, a.expr(0).span, a.name);
  const d = complexLu(pairs(m));
  if (!d) return fail('E-MATRIX-SINGULAR', a.expr(0).span, { function: a.name });
  const items: Quantity[] = new Array<Quantity>(n * b.cols);
  for (let c = 0; c < b.cols; c++) {
    const s = divideDims(at(b, 0, c).dim, rows[0]!);
    for (let i = 1; i < n; i++) if (!sameDim(at(b, i, c).dim, multiplyDims(rows[i]!, s))) fail('E-MATRIX-UNITS', a.expr(1).span, { function: a.name, row: i + 1, col: c + 1 });
    complexSolve(d, Array.from({ length: n }, (_, i): C => [at(b, i, c).si, at(b, i, c).im ?? 0])).forEach(([re, im], j) => {
      items[j * b.cols + c] = quantity(re, divideDims(s, cols[j]!), im ? { im } : {});
    });
  }
  return normalized(matrix(n, b.cols, items));
}

function numbers(m: MatrixValue): number[][] {
  return Array.from({ length: m.rows }, (_, i) => Array.from({ length: m.cols }, (_, j) => at(m, i, j).si));
}

// ---------------------------------------------------------------- units

/**
 * Row and column units with unit(i, j) = row(i) · col(j), when the matrix has
 * them (kN/m, kN | kN, kN·m: rows kN/m and kN, columns 1 and m).
 */
function structure(m: MatrixValue, span: Span, name: string): { rows: Dimension[]; cols: Dimension[] } {
  const rows: (Dimension | undefined)[] = new Array(m.rows).fill(undefined);
  const cols: (Dimension | undefined)[] = new Array(m.cols).fill(undefined);
  // A zero without a unit says nothing of its row and column: an assembled stiffness matrix has many. The items
  // that do say link rows and columns; each group of them linked is set from its first row.
  for (let start = 0; start < m.rows; start++) {
    if (rows[start]) continue;
    rows[start] = firstUnit(m, start);
    const pending: { index: number; isRow: boolean }[] = [{ index: start, isRow: true }];
    for (let next = pending.pop(); next; next = pending.pop()) {
      const size = next.isRow ? m.cols : m.rows;
      for (let other = 0; other < size; other++) {
        const q = next.isRow ? at(m, next.index, other) : at(m, other, next.index);
        if (isPlainZero(q)) continue;
        if (next.isRow && !cols[other]) {
          cols[other] = divideDims(q.dim, rows[next.index]!);
          pending.push({ index: other, isRow: false });
        } else if (!next.isRow && !rows[other]) {
          rows[other] = divideDims(q.dim, cols[next.index]!);
          pending.push({ index: other, isRow: true });
        }
      }
    }
  }
  const rowDims = rows.map((d) => d ?? DIMENSIONLESS);
  const colDims = cols.map((d) => d ?? DIMENSIONLESS);
  for (let i = 0; i < m.rows; i++) {
    for (let j = 0; j < m.cols; j++) {
      const q = at(m, i, j);
      if (!isPlainZero(q) && !sameDim(q.dim, multiplyDims(rowDims[i]!, colDims[j]!))) fail('E-MATRIX-UNITS', span, { function: name, row: i + 1, col: j + 1 });
    }
  }
  return { rows: rowDims, cols: colDims };
}

/** The unit of the first item of a row that has one. */
function firstUnit(m: MatrixValue, row: number): Dimension {
  for (let j = 0; j < m.cols; j++) if (!isPlainZero(at(m, row, j))) return at(m, row, j).dim;
  return DIMENSIONLESS;
}

/** A zero without a unit: of a matrix put together from parts, it stands for "nothing here". */
export function isPlainZero(q: Quantity): boolean {
  return q.si === 0 && !q.im && isDimensionless(q.dim);
}

/** Zeros without a unit among items of one unit take it; among items of different units they stay. */
export function withZerosOfUnit(items: readonly Quantity[]): Quantity[] {
  const others = items.filter((q) => !isPlainZero(q));
  const like = others[0];
  if (!like || others.length === items.length || isDimensionless(like.dim) || others.some((q) => !sameDim(q.dim, like.dim))) return [...items];
  const zero = quantity(0, like.dim, like.hint && !like.absolute ? { hint: like.hint } : {});
  return items.map((q) => (isPlainZero(q) ? zero : q));
}

/** The largest size of the numbers; a spread of a large matrix into Math.max would overflow the stack. */
function largest(a: readonly (readonly number[])[]): number {
  let scale = Number.MIN_VALUE;
  for (const row of a) for (const x of row) if (Math.abs(x) > scale) scale = Math.abs(x);
  return scale;
}

/** One unit for all items (eigenvalues need it). */
function uniform(m: MatrixValue, span: Span, name: string): Dimension {
  const dim = m.items[0]?.dim ?? DIMENSIONLESS;
  m.items.forEach((q, k) => {
    if (!sameDim(q.dim, dim)) fail('E-MATRIX-UNITS', span, { function: name, row: Math.floor(k / m.cols) + 1, col: (k % m.cols) + 1 });
  });
  return dim;
}

// ---------------------------------------------------------------- numerics

/** LU decomposition with partial pivoting; undefined for a singular matrix. */
function lu(a: number[][], smallest = 1e-14): { lu: number[][]; perm: number[]; sign: number } | undefined {
  const n = a.length;
  const m = a.map((r) => [...r]);
  const perm = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  const scale = largest(m);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[p]![k]!)) p = i;
    if (Math.abs(m[p]![k]!) <= smallest * scale) return undefined;
    if (p !== k) {
      [m[p], m[k]] = [m[k]!, m[p]!];
      [perm[p], perm[k]] = [perm[k]!, perm[p]!];
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      m[i]![k] = f;
      for (let j = k + 1; j < n; j++) m[i]![j]! -= f * m[k]![j]!;
    }
  }
  return { lu: m, perm, sign };
}

function luSolve(d: { lu: number[][]; perm: number[] }, b: readonly number[]): number[] {
  const n = b.length;
  const y = d.perm.map((p) => b[p]!);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) y[i]! -= d.lu[i]![j]! * y[j]!;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) y[i]! -= d.lu[i]![j]! * y[j]!;
    y[i] = y[i]! / d.lu[i]![i]!;
  }
  return y;
}

/**
 * Rows and columns scaled so the largest item of each is 1: [1e12, 1 | 1, 1e-6] is no singular matrix, only one of
 * very different units. The scales give x back: A·x = b is (R·A·C)·(C⁻¹·x) = R·b.
 */
function equilibrated(a: readonly (readonly number[])[]): { scaled: number[][]; rows: number[]; cols: number[] } {
  const rows = a.map((row) => {
    const big = Math.max(...row.map(Math.abs));
    return big > 0 ? 1 / big : 1;
  });
  const cols = a[0]!.map((_, j) => {
    let big = 0;
    a.forEach((row, i) => (big = Math.max(big, Math.abs(row[j]!) * rows[i]!)));
    return big > 0 ? 1 / big : 1;
  });
  return { scaled: a.map((row, i) => row.map((x, j) => x * rows[i]! * cols[j]!)), rows, cols };
}

/** How many digits a solution loses: the condition number, the sum norm of a matrix times that of its inverse. */
function conditionOf(a: readonly (readonly number[])[], d: { lu: number[][]; perm: number[] }): number {
  const n = a.length;
  const norm = (columns: readonly (readonly number[])[]) => Math.max(...columns.map((c) => c.reduce((sum, x) => sum + Math.abs(x), 0)));
  const inverse = Array.from({ length: n }, (_, j) => luSolve(d, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0))));
  return norm(Array.from({ length: n }, (_, j) => a.map((row) => row[j]!))) * norm(inverse);
}

/**
 * The determinant in fractions of its own size, or undefined when an item has no exact form or a square root.
 * The exact form of a value is limited, so the Hilbert matrix of 12 (2.6·10⁻⁷⁸) leaves it on the way.
 */
function exactDeterminant(m: MatrixValue): { value: number; form?: Exact } | undefined {
  const n = m.rows;
  const gcd = (x: bigint, y: bigint): bigint => {
    let [p, q] = [x < 0n ? -x : x, y < 0n ? -y : y];
    while (q !== 0n) [p, q] = [q, p % q];
    return p;
  };
  type Fraction = readonly [bigint, bigint];
  const reduced = (num: bigint, den: bigint): Fraction => {
    const g = gcd(num, den) || 1n;
    return den < 0n ? [-num / g, -den / g] : [num / g, den / g];
  };
  const a: Fraction[][] = [];
  for (let i = 0; i < n; i++) {
    const row: Fraction[] = [];
    for (let j = 0; j < n; j++) {
      const e = at(m, i, j).exact;
      if (!e || e.root !== 1n) return undefined;
      row.push([e.num, e.den]);
    }
    a.push(row);
  }
  let det: Fraction = [1n, 1n];
  for (let k = 0; k < n; k++) {
    const p = a.findIndex((row, i) => i >= k && row[k]![0] !== 0n);
    if (p < 0) return { value: 0, form: exact(0n)! };
    if (p !== k) {
      [a[p], a[k]] = [a[k]!, a[p]!];
      det = [-det[0], det[1]];
    }
    const pivot = a[k]![k]!;
    det = reduced(det[0] * pivot[0], det[1] * pivot[1]);
    for (let i = k + 1; i < n; i++) {
      const [fn, fd] = reduced(a[i]![k]![0] * pivot[1], a[i]![k]![1] * pivot[0]);
      for (let j = k; j < n; j++) {
        const [xn, xd] = a[i]![j]!;
        const [yn, yd] = a[k]![j]!;
        a[i]![j] = reduced(xn * fd * yd - fn * yn * xd, xd * fd * yd);
      }
    }
  }
  // Both parts cut to about 60 bits first: a Number of each could overflow.
  const shiftOf = (x: bigint) => Math.max(0, (x < 0n ? -x : x).toString(2).length - 60);
  const [up, down] = [shiftOf(det[0]), shiftOf(det[1])];
  const value = (Number(det[0] >> BigInt(up)) / Number(det[1] >> BigInt(down))) * 2 ** (up - down);
  const form = exact(det[0], det[1]);
  return { value, ...(form ? { form } : {}) };
}

/** Eigenvalues and eigenvectors (columns) of a symmetric matrix: Jacobi rotations. */
function jacobi(a: number[][]): { values: number[]; vectors: number[][] } {
  const n = a.length;
  const m = a.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i]![j]! ** 2;
    if (off <= 1e-30 * Math.max(1, ...m.map((r, i) => r[i]! ** 2))) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p]![q]!) < 1e-300) continue;
        const theta = (m[q]![q]! - m[p]![p]!) / (2 * m[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k]![p]!;
          const mkq = m[k]![q]!;
          m[k]![p] = c * mkp - s * mkq;
          m[k]![q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p]![k]!;
          const mqk = m[q]![k]!;
          m[p]![k] = c * mpk - s * mqk;
          m[q]![k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => m[x]![x]! - m[y]![y]!);
  return { values: order.map((i) => m[i]![i]!), vectors: v.map((r) => order.map((i) => r[i]!)) };
}

/** Cholesky factor L (A = L·Lᵀ) of a symmetric positive definite matrix. */
function cholesky(a: number[][]): number[][] | undefined {
  const n = a.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i]![j]!;
      for (let k = 0; k < j; k++) sum -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (sum <= 0) return undefined;
        l[i]![i] = Math.sqrt(sum);
      } else l[i]![j] = sum / l[j]![j]!;
    }
  }
  return l;
}

function symmetric(a: number[][]): boolean {
  const scale = largest(a);
  return a.every((r, i) => r.every((x, j) => Math.abs(x - a[j]![i]!) <= 1e-9 * scale));
}

/**
 * Eigenvalues of A, or of K·φ = λ·M·φ (vibration: λ = ω²), with eigenvectors
 * scaled so their largest item is 1 (mode shapes).
 */
function eigen(args: Args): { values: number[]; vectors: number[][]; dim: Dimension } {
  const name = args.name;
  const k = asMatrix(args.value(0), args.expr(0).span);
  const n = square(k, args.expr(0).span, name);
  const dk = uniform(k, args.expr(0).span, name);
  const a = numbers(k);
  if (!symmetric(a)) fail('E-MATRIX-SYMMETRIC', args.expr(0).span, { function: name });
  if (args.count === 1) return { ...jacobi(a), dim: dk };
  const mm = asMatrix(args.value(1), args.expr(1).span);
  if (square(mm, args.expr(1).span, name) !== n) fail('E-MATRIX-SHAPE', args.call.span, { operator: name, left: `${n}×${n}`, right: `${mm.rows}×${mm.cols}` });
  const dm = uniform(mm, args.expr(1).span, name);
  const b = numbers(mm);
  if (!symmetric(b)) fail('E-MATRIX-SYMMETRIC', args.expr(1).span, { function: name });
  // K·φ = λ·M·φ with M = L·Lᵀ becomes L⁻¹·K·L⁻ᵀ·ψ = λ·ψ, φ = L⁻ᵀ·ψ.
  const l = cholesky(b);
  if (!l) return fail('E-MATRIX-SINGULAR', args.expr(1).span, { function: name });
  const solveL = (col: number[]) => {
    const y = [...col];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) y[i]! -= l[i]![j]! * y[j]!;
      y[i] = y[i]! / l[i]![i]!;
    }
    return y;
  };
  // C = L⁻¹·K·L⁻ᵀ: columns of L⁻¹·K, then the same from the other side.
  const half = Array.from({ length: n }, (_, j) => solveL(a.map((r) => r[j]!)));
  const c = Array.from({ length: n }, (_, j) => solveL(half.map((col) => col[j]!)));
  const { values, vectors } = jacobi(c);
  const phi = Array.from({ length: n }, (_, col) => {
    const psi = vectors.map((r) => r[col]!);
    const x = [...psi];
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) x[i]! -= l[j]![i]! * x[j]!;
      x[i] = x[i]! / l[i]![i]!;
    }
    return x;
  });
  return { values, vectors: Array.from({ length: n }, (_, i) => phi.map((col) => col[i]!)), dim: divideDims(dk, dm) };
}

/** Two items on one place of a matrix put together: a place named twice in dofs adds up. */
function added(a: Quantity, b: Quantity, span: Span): Quantity {
  if (isPlainZero(a)) return b;
  if (isPlainZero(b)) return a;
  if (!sameDim(a.dim, b.dim)) fail('E-MATRIX-UNITS', span, { function: 'scatter', row: 0, col: 0 });
  const { exact: _exact, ...rest } = a;
  return { ...rest, si: a.si + b.si };
}

/**
 * One square matrix that is not real and symmetric: its eigenvalues, by real part and then with the positive
 * imaginary part first; undefined for what the symmetric way takes (and for a pair K, M, which it alone can do).
 */
function generalEigen(a: Args): { values: C[]; dim: Dimension } | undefined {
  if (a.count !== 1) return undefined;
  const m = asMatrix(a.value(0), a.expr(0).span);
  const n = square(m, a.expr(0).span, a.name);
  const dim = uniform(m, a.expr(0).span, a.name);
  if (m.items.every((q) => !q.im) && symmetric(numbers(m))) return undefined;
  const found = eigenvalues(pairs(m));
  if (!found) return fail('E-EIGEN-NO-CONVERGENCE', a.expr(0).span);
  const scale = found.reduce((big, v) => Math.max(big, size(v)), Number.MIN_VALUE);
  const real = m.items.every((q) => !q.im);
  const values = found.map(([re, im]): C => [Math.abs(re) <= 1e-13 * scale ? 0 : re, Math.abs(im) <= 1e-11 * scale ? 0 : im]);
  // Of a real matrix the complex ones come in exact pairs; rounding must not make them differ in the last digits.
  if (real) {
    const done = new Set<number>();
    values.forEach((v, i) => {
      if (v[1] === 0 || done.has(i)) return;
      const j = values.findIndex((w, k) => k !== i && !done.has(k) && Math.abs(w[0] - v[0]) <= 1e-9 * scale && Math.abs(w[1] + v[1]) <= 1e-9 * scale);
      if (j < 0) return;
      const [re, im] = [(v[0] + values[j]![0]) / 2, (v[1] - values[j]![1]) / 2];
      values[i] = [re, im];
      values[j] = [re, -im];
      done.add(i).add(j);
    });
  }
  void n;
  return { values: values.sort((p, q) => p[0] - q[0] || q[1] - p[1]), dim };
}

function shapeText(m: MatrixValue): string {
  return `${m.rows}×${m.cols}`;
}

// ---------------------------------------------------------------- functions

const series = (items: Quantity[]): VectorValue => ({ type: 'vector', items });

export const LINEAR: readonly FunctionDef[] = [
  {
    name: 'transpose',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      return normalized(matrix(m.cols, m.rows, Array.from({ length: m.rows * m.cols }, (_, k) => at(m, k % m.rows, Math.floor(k / m.rows)))));
    },
  },
  {
    name: 'det',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      const n = square(m, a.expr(0).span, a.name);
      const { rows, cols } = structure(m, a.expr(0).span, a.name);
      const dim = rows.reduce((d, r, i) => multiplyDims(d, multiplyDims(r, cols[i]!)), DIMENSIONLESS);
      if (m.items.some((q) => q.im)) {
        const c = complexLu(pairs(m), 0);
        if (!c) return quantity(0, dim);
        const [re, im] = complexDet(c);
        return quantity(re, dim, im ? { im } : {});
      }
      // Written in decimals, the determinant is known exactly, however small: the Hilbert matrix of 12 has 2.6·10⁻⁷⁸.
      const whole = n <= EXACT_SOLVE_SIZE ? exactDeterminant(m) : undefined;
      if (whole) return quantity(whole.value, dim, whole.form ? { exact: whole.form } : {});
      const a0 = numbers(m);
      // A pivot lost in rounding: no zero can be told from a very small number. Not rounded to 0, and said so.
      if (!lu(a0)) a.warn(diagnostic('W-ILL-CONDITIONED', a.call.span, { function: a.name }));
      const d = lu(a0, 0);
      if (!d) return quantity(0, dim);
      let det = d.sign;
      for (let i = 0; i < n; i++) det *= d.lu[i]![i]!;
      return quantity(det, dim);
    },
  },
  {
    name: 'inverse',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => inverseOf(asMatrix(a.value(0), a.expr(0).span), a.expr(0).span, a.name),
  },
  {
    name: 'lsolve',
    module: 'linear',
    params: 'A, b',
    arity: [2, 2],
    call: (a) => {
      // A·x = b; x has the units that make every row hold.
      const m = asMatrix(a.value(0), a.expr(0).span);
      const n = square(m, a.expr(0).span, a.name);
      const b = asMatrix(a.value(1), a.expr(1).span);
      if (b.rows !== n) fail('E-MATRIX-SHAPE', a.call.span, { operator: a.name, left: shapeText(m), right: shapeText(b) });
      const { rows, cols } = structure(m, a.expr(0).span, a.name);
      if (m.items.some((q) => q.im) || b.items.some((q) => q.im)) return complexLsolve(a, m, b, rows);
      const scales = equilibrated(numbers(m));
      const d = lu(scales.scaled);
      if (!d) return fail('E-MATRIX-SINGULAR', a.expr(0).span, { function: a.name });
      if (n <= MAX_CONDITION_SIZE && conditionOf(scales.scaled, d) > LOST_DIGITS_CONDITION) a.warn(diagnostic('W-ILL-CONDITIONED', a.call.span, { function: a.name }));
      const items: Quantity[] = new Array<Quantity>(n * b.cols);
      for (let c = 0; c < b.cols; c++) {
        // The right side: b(i) = row(i) · s, the same s in every row.
        const s = divideDims(at(b, 0, c).dim, rows[0]!);
        for (let i = 1; i < n; i++) if (!sameDim(at(b, i, c).dim, multiplyDims(rows[i]!, s))) fail('E-MATRIX-UNITS', a.expr(1).span, { function: a.name, row: i + 1, col: c + 1 });
        const x = luSolve(d, Array.from({ length: n }, (_, i) => at(b, i, c).si * scales.rows[i]!)).map((v, j) => v * scales.cols[j]!);
        // With every element exact (written in decimals), the solution is exact too: 96/83.
        const given = Array.from({ length: n }, (_, i) => at(b, i, c).exact);
        const coefficients = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => at(m, i, j).exact));
        // Fractions only where someone reads them: over a large system their digits grow without end and the window would freeze.
        const exactly = n <= EXACT_SOLVE_SIZE && given.every((e) => e) && coefficients.every((row) => row.every((e) => e)) ? solveLinear(coefficients as Exact[][], given as Exact[]) : undefined;
        x.forEach((value, j) => (items[j * b.cols + c] = quantity(value, divideDims(s, cols[j]!), exactly ? { exact: exactly[j]! } : {})));
      }
      return normalized(matrix(n, b.cols, items));
    },
  },
  {
    // scatter(K_e, dofs, n): the matrix (or load vector) of a member at its places in the whole: 0 in dofs is a fixed one, left out.
    name: 'scatter',
    module: 'linear',
    params: 'K_e, dofs, n',
    arity: [3, 3],
    call: (a) => {
      const part = a.value(0);
      if (part.type !== 'matrix' && part.type !== 'vector') return fail('E-TYPE', a.expr(0).span, { expected: 'matrix', found: part.type === 'quantity' ? 'number' : part.type });
      const places = a.value(1);
      if (places.type !== 'vector') return fail('E-TYPE', a.expr(1).span, { expected: 'vector', found: places.type === 'quantity' ? 'number' : places.type });
      const n = a.number(2);
      if (!Number.isInteger(n) || n < 1 || n > 1000) a.domain(2);
      const size = part.type === 'matrix' ? part.rows : part.items.length;
      if ((part.type === 'matrix' && part.cols !== size) || places.items.length !== size) {
        fail('E-MATRIX-SHAPE', a.call.span, { operator: a.name, left: part.type === 'matrix' ? shapeText(part) : `${size}`, right: `${places.items.length}` });
      }
      places.items.forEach((q) => {
        if (!isDimensionless(q.dim) || !Number.isInteger(q.si) || q.si < 0 || q.si > n) fail('E-INDEX', a.expr(1).span, { index: q.si, length: n });
      });
      const dof = places.items.map((q) => q.si - 1);
      const plain = quantity(0);
      if (part.type === 'vector') {
        const items = new Array<Quantity>(n).fill(plain);
        dof.forEach((p, k) => {
          if (p >= 0) items[p] = added(items[p]!, part.items[k]!, a.call.span);
        });
        return { type: 'vector', items: withZerosOfUnit(items) };
      }
      const items = new Array<Quantity>(n * n).fill(plain);
      dof.forEach((p, i) => {
        dof.forEach((q, j) => {
          if (p >= 0 && q >= 0) items[p * n + q] = added(items[p * n + q]!, at(part, i, j), a.call.span);
        });
      });
      return matrix(n, n, withZerosOfUnit(items));
    },
  },
  {
    // submatrix(A, 1, 2, 2, 3): rows 1 to 2 and columns 2 to 3, counted from 1.
    name: 'submatrix',
    module: 'linear',
    params: 'A, r1, r2, c1, c2',
    arity: [5, 5],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      const [r1, r2, c1, c2] = [a.number(1), a.number(2), a.number(3), a.number(4)];
      const whole = (x: number, to: number, i: number) => {
        if (!Number.isInteger(x) || x < 1 || x > to) fail('E-INDEX', a.expr(i).span, { index: x, length: to });
      };
      whole(r1, m.rows, 1);
      whole(r2, m.rows, 2);
      whole(c1, m.cols, 3);
      whole(c2, m.cols, 4);
      if (r2 < r1 || c2 < c1) a.domain();
      const items: Quantity[] = [];
      for (let i = r1 - 1; i < r2; i++) for (let j = c1 - 1; j < c2; j++) items.push(at(m, i, j));
      return normalized(matrix(r2 - r1 + 1, c2 - c1 + 1, items));
    },
  },
  {
    // Side by side: the same number of rows.
    name: 'augment',
    module: 'linear',
    params: 'A, B',
    arity: [2, 2],
    call: (a) => {
      const [x, y] = [asMatrix(a.value(0), a.expr(0).span), asMatrix(a.value(1), a.expr(1).span)];
      if (x.rows !== y.rows) fail('E-MATRIX-SHAPE', a.call.span, { operator: a.name, left: shapeText(x), right: shapeText(y) });
      const items: Quantity[] = [];
      for (let i = 0; i < x.rows; i++) {
        for (let j = 0; j < x.cols; j++) items.push(at(x, i, j));
        for (let j = 0; j < y.cols; j++) items.push(at(y, i, j));
      }
      return matrix(x.rows, x.cols + y.cols, items);
    },
  },
  {
    // One under the other: the same number of columns.
    name: 'stack',
    module: 'linear',
    params: 'A, B',
    arity: [2, 2],
    call: (a) => {
      const [x, y] = [asMatrix(a.value(0), a.expr(0).span), asMatrix(a.value(1), a.expr(1).span)];
      if (x.cols !== y.cols) fail('E-MATRIX-SHAPE', a.call.span, { operator: a.name, left: shapeText(x), right: shapeText(y) });
      return normalized(matrix(x.rows + y.rows, x.cols, [...x.items, ...y.items]));
    },
  },
  {
    // Item by item, not as a matrix product.
    name: 'hprod',
    module: 'linear',
    params: 'A, B',
    arity: [2, 2],
    call: (a) => {
      const [x, y] = [asMatrix(a.value(0), a.expr(0).span), asMatrix(a.value(1), a.expr(1).span)];
      if (x.rows !== y.rows || x.cols !== y.cols) fail('E-MATRIX-SHAPE', a.call.span, { operator: a.name, left: shapeText(x), right: shapeText(y) });
      return normalized(matrix(x.rows, x.cols, x.items.map((q, k) => quantity(q.si * y.items[k]!.si, multiplyDims(q.dim, y.items[k]!.dim)))));
    },
  },
  {
    name: 'kprod',
    module: 'linear',
    params: 'A, B',
    arity: [2, 2],
    call: (a) => {
      const [x, y] = [asMatrix(a.value(0), a.expr(0).span), asMatrix(a.value(1), a.expr(1).span)];
      const items: Quantity[] = [];
      for (let i = 0; i < x.rows; i++) {
        for (let k = 0; k < y.rows; k++) {
          for (let j = 0; j < x.cols; j++) {
            for (let l = 0; l < y.cols; l++) items.push(quantity(at(x, i, j).si * at(y, k, l).si, multiplyDims(at(x, i, j).dim, at(y, k, l).dim)));
          }
        }
      }
      return normalized(matrix(x.rows * y.rows, x.cols * y.cols, items));
    },
  },
  {
    name: 'rank',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      if (m.items.some((q) => q.im)) fail('E-COMPLEX-ARG', a.expr(0).span);
      const { values } = singularValues(numbers(m));
      const top = values[0] ?? 0;
      return quantity(values.filter((v) => v > 1e-11 * top).length);
    },
  },
  {
    name: 'singvals',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      if (m.items.some((q) => q.im)) fail('E-COMPLEX-ARG', a.expr(0).span);
      const dim = uniform(m, a.expr(0).span, a.name);
      return series(singularValues(numbers(m)).values.map((v) => quantity(v, dim)));
    },
  },
  {
    name: 'cond',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      if (m.items.some((q) => q.im)) fail('E-COMPLEX-ARG', a.expr(0).span);
      square(m, a.expr(0).span, a.name);
      const { values } = singularValues(numbers(m));
      const least = values[values.length - 1]!;
      if (!(least > 1e-300)) return fail('E-MATRIX-SINGULAR', a.expr(0).span, { function: a.name });
      return quantity(values[0]! / least);
    },
  },
  {
    name: 'nullspace',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      if (m.items.some((q) => q.im)) fail('E-COMPLEX-ARG', a.expr(0).span);
      const { values, v } = singularValues(numbers(m));
      const top = values[0] ?? 0;
      const free = values.map((value, j) => (value <= 1e-11 * top ? j : -1)).filter((j) => j >= 0);
      if (free.length === 0) return fail('E-NULLSPACE-NONE', a.expr(0).span);
      const columns = free.map((j) => {
        const column = v.map((row) => row[j]!);
        const big = column.reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0);
        return column.map((x) => {
          const scaled = x / big;
          return Math.abs(scaled) < 1e-12 ? 0 : scaled;
        });
      });
      const items: Quantity[] = [];
      for (let i = 0; i < m.cols; i++) for (const column of columns) items.push(quantity(column[i]!));
      return normalized(matrix(m.cols, columns.length, items));
    },
  },
  {
    // As text: nothing calculates with it, it is how a result is read.
    name: 'rat',
    module: 'series',
    params: 'x',
    arity: [1, 1],
    call: (a) => {
      const value = a.value(0);
      const items = value.type === 'vector' || value.type === 'matrix' ? value.items : [a.quantity(0)];
      const shown = items.map((q) => {
        const found = isDimensionless(q.dim) && !q.im ? fractionOf(q.si) : undefined;
        if (!found) return a.domain(0);
        return found[1] === 1 ? String(found[0]) : `${found[0]}/${found[1]}`;
      });
      return { type: 'text', value: shown.join('; ') };
    },
  },
  {
    // The smallest whole numbers in the same ratio: the coefficients of a chemical equation from its null space.
    name: 'whole',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const value = a.value(0);
      const items = value.type === 'vector' || value.type === 'matrix' ? value.items : [a.quantity(0)];
      const fractions = items.map((q) => (isDimensionless(q.dim) && !q.im ? fractionOf(q.si) : undefined) ?? a.domain(0));
      const gcd = (x: number, y: number): number => (y === 0 ? Math.abs(x) : gcd(y, x % y));
      const denominators = fractions.reduce((l, [, d]) => (l / gcd(l, d)) * d, 1);
      const whole = fractions.map(([n, d]) => (n * denominators) / d);
      const common = whole.reduce((g, x) => gcd(g, x), 0);
      if (common === 0 || !whole.every((x) => Number.isSafeInteger(x))) return a.domain(0);
      // The first that is not zero is positive: reactants on the left, as an equation is written.
      const sign = Math.sign(whole.find((x) => x !== 0)!);
      const out = whole.map((x) => quantity((sign * x) / common));
      return value.type === 'vector' || value.type === 'matrix' ? { ...value, items: out } : out[0]!;
    },
  },
  {
    name: 'molar_mass',
    module: 'statistics',
    params: '"formula"',
    arity: [1, 1],
    call: (a) => {
      const given = a.value(0);
      if (given.type !== 'text') return fail('E-TYPE', a.expr(0).span, { expected: 'text', found: given.type === 'quantity' ? 'number' : given.type });
      const mass = molarMass(given.value);
      if (mass === undefined) return fail('E-FORMULA', a.expr(0).span, { formula: given.value });
      // kg/mol in SI, shown in g/mol.
      return quantity(mass / 1000, multiplyDims({ M: 1 }, { N: -1 }), { hint: { symbol: 'g/mol', factor: 1e-3, dim: multiplyDims({ M: 1 }, { N: -1 }) } });
    },
  },
  {
    name: 'unwrap',
    module: 'series',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      let shift = 0;
      return series(
        items.map((q, i) => {
          if (i > 0) {
            const step = q.si - items[i - 1]!.si;
            if (step > Math.PI) shift -= 2 * Math.PI;
            else if (step < -Math.PI) shift += 2 * Math.PI;
          }
          return quantity(q.si + shift, q.dim, q.hint ? { hint: q.hint } : {});
        }),
      );
    },
  },
  {
    name: 'identity',
    module: 'linear',
    params: 'n',
    arity: [1, 1],
    call: (a) => {
      const n = a.number(0);
      if (!Number.isInteger(n) || n < 1 || n > 1000) a.domain(0);
      return matrix(n, n, Array.from({ length: n * n }, (_, k) => quantity(Math.floor(k / n) === k % n ? 1 : 0)));
    },
  },
  { name: 'rows', module: 'linear', params: 'A', arity: [1, 1], call: (a) => quantity(asMatrix(a.value(0), a.expr(0).span).rows) },
  { name: 'cols', module: 'linear', params: 'A', arity: [1, 1], call: (a) => quantity(asMatrix(a.value(0), a.expr(0).span).cols) },
  {
    name: 'row',
    module: 'linear',
    params: 'A, i',
    arity: [2, 2],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      const i = index(a, 1, m.rows);
      return series(Array.from({ length: m.cols }, (_, j) => at(m, i, j)));
    },
  },
  {
    name: 'col',
    module: 'linear',
    params: 'A, j',
    arity: [2, 2],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      const j = index(a, 1, m.cols);
      return series(Array.from({ length: m.rows }, (_, i) => at(m, i, j)));
    },
  },
  {
    name: 'diag',
    module: 'linear',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      // diag(v): a matrix with v on the diagonal; diag(A): the diagonal of A.
      const value = a.value(0);
      if (value.type === 'matrix') return series(Array.from({ length: Math.min(value.rows, value.cols) }, (_, i) => at(value, i, i)));
      const items = a.series(0);
      const n = items.length;
      const zero = (q: Quantity) => quantity(0, q.dim, q.hint ? { hint: q.hint } : {});
      return matrix(n, n, Array.from({ length: n * n }, (_, k) => (Math.floor(k / n) === k % n ? items[k % n]! : zero(items[k % n]!))));
    },
  },
  {
    name: 'trace',
    module: 'linear',
    params: 'A',
    arity: [1, 1],
    call: (a) => {
      const m = asMatrix(a.value(0), a.expr(0).span);
      const n = square(m, a.expr(0).span, a.name);
      const dim = uniform(matrix(n, 1, Array.from({ length: n }, (_, i) => at(m, i, i))), a.expr(0).span, a.name);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += at(m, i, i).si;
      const first = at(m, 0, 0);
      return quantity(sum, dim, first.hint ? { hint: first.hint } : {});
    },
  },
  {
    name: 'dot',
    module: 'linear',
    params: 'a, b',
    arity: [2, 2],
    call: (a) => {
      const [u, v] = [a.series(0), a.series(1)];
      if (u.length !== v.length) fail('E-VECTOR-LENGTH', a.call.span, { left: u.length, right: v.length });
      const dim = multiplyDims(u[0]?.dim ?? DIMENSIONLESS, v[0]?.dim ?? DIMENSIONLESS);
      let sum = 0;
      u.forEach((q, i) => {
        if (!sameDim(multiplyDims(q.dim, v[i]!.dim), dim)) fail('E-UNIT-MISMATCH', a.call.span, { operator: '+', left: baseUnitSymbol(dim), right: baseUnitSymbol(multiplyDims(q.dim, v[i]!.dim)) });
        sum += q.si * v[i]!.si;
      });
      return quantity(sum, dim);
    },
  },
  {
    name: 'cross',
    module: 'linear',
    params: 'a, b',
    arity: [2, 2],
    call: (a) => {
      const [u, v] = [a.series(0), a.series(1)];
      if (u.length !== 3 || v.length !== 3) fail('E-VECTOR-LENGTH', a.call.span, { left: u.length, right: v.length });
      const dim = multiplyDims(u[0]!.dim, v[0]!.dim);
      [...u.slice(1), ...v.slice(1)].forEach((q, k) => {
        const ref = k < 2 ? u[0]! : v[0]!;
        if (!sameDim(q.dim, ref.dim)) fail('E-UNIT-MISMATCH', a.expr(k < 2 ? 0 : 1).span, { operator: ',', left: baseUnitSymbol(ref.dim), right: baseUnitSymbol(q.dim) });
      });
      const [x1, y1, z1] = u.map((q) => q.si) as [number, number, number];
      const [x2, y2, z2] = v.map((q) => q.si) as [number, number, number];
      return series([y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2].map((s) => quantity(s, dim)));
    },
  },
  {
    name: 'norm',
    module: 'linear',
    params: 'v',
    arity: [1, 1],
    call: (a) => {
      const items = a.series(0);
      const first = items[0];
      if (!first) return quantity(0);
      items.forEach((q, i) => {
        if (!sameDim(q.dim, first.dim)) fail('E-UNIT-MISMATCH', a.expr(0).span, { operator: ',', left: baseUnitSymbol(first.dim), right: baseUnitSymbol(items[i]!.dim) });
      });
      return quantity(Math.hypot(...items.map((q) => q.si)), first.dim, first.hint ? { hint: first.hint } : {});
    },
  },
  {
    name: 'eigenvals',
    module: 'linear',
    params: 'K, M',
    arity: [1, 2],
    call: (a) => {
      const general = generalEigen(a);
      if (general) {
        const hintOf = a.value(0).type === 'matrix' ? (a.value(0) as MatrixValue).items[0]?.hint : undefined;
        return series(general.values.map(([re, im]) => quantity(re, general.dim, { ...(hintOf ? { hint: hintOf } : {}), ...(im ? { im } : {}) })));
      }
      const { values, dim } = eigen(a);
      // Of one matrix in one unit (a stress tensor in MPa) the values keep that unit: principal stresses in MPa.
      const given = a.count === 1 ? a.value(0) : undefined;
      const hint = given?.type === 'matrix' && given.items[0]?.hint && given.items.every((q) => q.hint?.symbol === given.items[0]!.hint!.symbol) ? given.items[0].hint : undefined;
      return series(values.map((v) => quantity(v, dim, hint ? { hint } : {})));
    },
  },
  {
    name: 'eigenvecs',
    module: 'linear',
    params: 'K, M',
    arity: [1, 2],
    call: (a) => {
      const general = generalEigen(a);
      if (general) {
        const n = general.values.length;
        const columns = general.values.map((value) => eigenvector(pairs(asMatrix(a.value(0), a.expr(0).span)), value));
        const items: Quantity[] = [];
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const [re, im] = columns[j]![i]!;
            const clean = Math.abs(im) <= 1e-9 * Math.max(1, Math.abs(re)) ? 0 : im;
            items.push(quantity(re, undefined, clean ? { im: clean } : {}));
          }
        }
        return normalized(matrix(n, n, items));
      }
      const { vectors } = eigen(a);
      const n = vectors.length;
      // Each column scaled so its largest item is 1.
      const scale = Array.from({ length: n }, (_, j) => {
        let big = 0;
        for (let i = 0; i < n; i++) if (Math.abs(vectors[i]![j]!) > Math.abs(big)) big = vectors[i]![j]!;
        return big || 1;
      });
      return matrix(n, n, Array.from({ length: n * n }, (_, k) => quantity(vectors[Math.floor(k / n)]![k % n]! / scale[k % n]!)));
    },
  },
];

function index(a: Args, k: number, size: number): number {
  const i = a.number(k);
  if (!Number.isInteger(i) || i < 1 || i > size) fail('E-INDEX', a.expr(k).span, { index: i, length: size });
  return i - 1;
}

/** The inverse: item (j, i) has the unit 1 / (row(i) · col(j)). */
export function inverseOf(m: MatrixValue, span: Span, name: string): MatrixValue {
  const n = square(m, span, name);
  const { rows, cols } = structure(m, span, name);
  if (m.items.some((q) => q.im)) {
    const c = complexLu(pairs(m));
    if (!c) return fail('E-MATRIX-SINGULAR', span, { function: name });
    const inverse: Quantity[] = new Array<Quantity>(n * n);
    for (let k = 0; k < n; k++) {
      complexSolve(c, Array.from({ length: n }, (_, i) => (i === k ? ([1, 0] as C) : ([0, 0] as C)))).forEach(([re, im], r) => {
        inverse[r * n + k] = quantity(re, powerDim(multiplyDims(rows[k]!, cols[r]!), -1), im ? { im } : {});
      });
    }
    return matrix(n, n, inverse);
  }
  const d = lu(numbers(m));
  if (!d) return fail('E-MATRIX-SINGULAR', span, { function: name });
  const items: Quantity[] = new Array<Quantity>(n * n);
  for (let c = 0; c < n; c++) {
    const x = luSolve(d, Array.from({ length: n }, (_, i) => (i === c ? 1 : 0)));
    x.forEach((value, r) => (items[r * n + c] = quantity(value, powerDim(multiplyDims(rows[c]!, cols[r]!), -1))));
  }
  return matrix(n, n, items);
}

export function isMatrixDimensionless(m: MatrixValue): boolean {
  return m.items.every((q) => isDimensionless(q.dim));
}
