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
import { divide, exact, multiply, negate, solveLinear, subtract, toNumber, type Exact } from '../values/exact.js';
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

/** The determinant in fractions, or undefined when an item has no exact form or a square root. */
function exactDeterminant(m: MatrixValue): Exact | undefined {
  const n = m.rows;
  const a: Exact[][] = [];
  for (let i = 0; i < n; i++) {
    const row: Exact[] = [];
    for (let j = 0; j < n; j++) {
      const e = at(m, i, j).exact;
      if (!e || e.root !== 1n) return undefined;
      row.push(e);
    }
    a.push(row);
  }
  let det = exact(1n)!;
  for (let k = 0; k < n; k++) {
    const p = a.findIndex((row, i) => i >= k && row[k]!.num !== 0n);
    if (p < 0) return exact(0n);
    if (p !== k) {
      [a[p], a[k]] = [a[k]!, a[p]!];
      det = negate(det);
    }
    const next = multiply(det, a[k]![k]!);
    if (!next) return undefined;
    det = next;
    for (let i = k + 1; i < n; i++) {
      const f = divide(a[i]![k]!, a[k]![k]!);
      if (!f) return undefined;
      for (let j = k; j < n; j++) {
        const term = multiply(f, a[k]![j]!);
        const value = term && subtract(a[i]![j]!, term);
        if (!value) return undefined;
        a[i]![j] = value;
      }
    }
  }
  return det;
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
      // Written in decimals, the determinant is known exactly, however small: the Hilbert matrix of 12 has 2.6·10⁻⁷⁸.
      const whole = n <= EXACT_SOLVE_SIZE ? exactDeterminant(m) : undefined;
      if (whole) return quantity(toNumber(whole), dim, { exact: whole });
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
