/**
 * The dimensions of symbols of theory, worked out from the equations they stand in:
 * dF == dF_1 − dF_2, dF_1 == p·dS, dS == l·dy, p_h == ρ·g·y with ρ, g, l of the sheet
 * make dy and y lengths, dS an area, p_h a pressure and dF a force.
 *
 * Every equation (two members of a step, the sides of a relation) and every sum
 * (a + b) says that two dimensions are equal. A dimension is a sum of exponents of
 * base dimensions, so each such condition is linear in the unknown exponents of the
 * symbols; one system per base dimension, solved by Gaussian elimination. What the
 * equations leave open stays a pure number.
 */

import type { Expr } from '../lang/ast.js';
import { dim, type Dimension } from '../units/dimension.js';
import type { Value } from '../values/value.js';

/** A dimension known up to the unknowns: constant exponents plus coefficients of the unknown symbols. */
interface Linear {
  readonly constant: Readonly<Record<string, number>>;
  readonly unknowns: ReadonlyMap<number, number>;
}

const ZERO: Linear = { constant: {}, unknowns: new Map() };

function combine(a: Linear, b: Linear, sign: number): Linear {
  const constant: Record<string, number> = { ...a.constant };
  for (const key in b.constant) constant[key] = (constant[key] ?? 0) + sign * b.constant[key]!;
  const unknowns = new Map(a.unknowns);
  for (const [i, c] of b.unknowns) unknowns.set(i, (unknowns.get(i) ?? 0) + sign * c);
  return { constant, unknowns };
}

function scale(a: Linear, n: number): Linear {
  const constant: Record<string, number> = {};
  for (const key in a.constant) constant[key] = a.constant[key]! * n;
  return { constant, unknowns: new Map([...a.unknowns].map(([i, c]) => [i, c * n])) };
}

/** Functions whose argument must be a pure number and whose value is one. */
const PURE = new Set(['sin', 'cos', 'tan', 'tg', 'cot', 'cotg', 'asin', 'acos', 'atan', 'exp', 'ln', 'log', 'log10', 'sinh', 'cosh', 'tanh']);

/**
 * @param symbols the names whose dimensions are sought, in order
 * @param equations pairs of expressions of one dimension
 * @param known the value of a name of the sheet (for its dimension), or undefined for a symbol
 * @param literal the value of a number written with a unit (5 m)
 * @returns the dimension of each symbol, or undefined where the equations contradict each other
 */
export function symbolDimensions(
  symbols: readonly string[],
  equations: readonly (readonly [Expr, Expr])[],
  known: (name: string) => Value | undefined,
  literal: (expr: Expr) => Value | undefined,
): readonly Dimension[] | undefined {
  const index = new Map(symbols.map((s, i) => [s, i] as const));
  const conditions: Linear[] = [];
  const equal = (a: Linear | undefined, b: Linear | undefined) => {
    if (a && b) conditions.push(combine(a, b, -1));
  };
  // The dimension of an expression; undefined where it cannot be told (a function of the sheet, a table).
  const of = (e: Expr): Linear | undefined => {
    switch (e.kind) {
      case 'number':
        if (!e.unit) return ZERO;
        {
          const v = literal(e);
          return v?.type === 'quantity' ? { constant: v.dim, unknowns: new Map() } : undefined;
        }
      case 'variable': {
        const i = index.get(e.name);
        if (i !== undefined) return { constant: {}, unknowns: new Map([[i, 1]]) };
        const v = known(e.name);
        return v?.type === 'quantity' ? { constant: v.dim, unknowns: new Map() } : undefined;
      }
      case 'unary':
        return of(e.operand);
      case 'binary': {
        const [l, r] = [of(e.left), of(e.right)];
        switch (e.operator) {
          case '*':
            return l && r ? combine(l, r, 1) : undefined;
          case '/':
            return l && r ? combine(l, r, -1) : undefined;
          case '^': {
            const n = e.right.kind === 'number' && !e.right.unit ? e.right.value : e.right.kind === 'unary' && e.right.operand.kind === 'number' ? -e.right.operand.value : undefined;
            return l && n !== undefined ? scale(l, n) : undefined;
          }
          case '+':
          case '-':
          case '±':
          case '==':
          case '<':
          case '<=':
          case '>':
          case '>=':
          case '!=':
            equal(l, r);
            return l ?? r;
          default:
            return undefined;
        }
      }
      case 'call': {
        const args = e.args.map(of);
        if (e.name === 'sqrt' && args[0]) return scale(args[0], 0.5);
        if (e.name === 'cbrt' && args[0]) return scale(args[0], 1 / 3);
        if (e.name === 'abs' && args[0]) return args[0];
        if (PURE.has(e.name)) {
          equal(args[0], ZERO);
          return ZERO;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  };
  for (const [a, b] of equations) equal(of(a), of(b));
  if (conditions.length === 0) return symbols.map(() => dim({}));

  // One system per base dimension, the same coefficients for all of them.
  const bases = [...new Set(conditions.flatMap((c) => Object.keys(c.constant)))];
  const n = symbols.length;
  const rows = conditions.map((c) => ({ a: Array.from({ length: n }, (_, i) => c.unknowns.get(i) ?? 0), b: bases.map((key) => -(c.constant[key] ?? 0)) }));
  const solution = Array.from({ length: n }, () => bases.map(() => 0));
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < rows.length; col++) {
    let best = row;
    for (let r = row + 1; r < rows.length; r++) if (Math.abs(rows[r]!.a[col]!) > Math.abs(rows[best]!.a[col]!)) best = r;
    if (Math.abs(rows[best]!.a[col]!) < 1e-12) continue;
    [rows[row], rows[best]] = [rows[best]!, rows[row]!];
    const pivot = rows[row]!;
    for (let r = 0; r < rows.length; r++) {
      if (r === row) continue;
      const f = rows[r]!.a[col]! / pivot.a[col]!;
      if (f === 0) continue;
      rows[r] = { a: rows[r]!.a.map((v, k) => v - f * pivot.a[k]!), b: rows[r]!.b.map((v, k) => v - f * pivot.b[k]!) };
    }
    pivots.push(col);
    row++;
  }
  // A row without unknowns that is not 0 = 0: the equations contradict each other.
  for (let r = row; r < rows.length; r++) if (rows[r]!.b.some((v) => Math.abs(v) > 1e-9)) return undefined;
  pivots.forEach((col, r) => {
    // Free unknowns are 0 (pure numbers); a pivot row then gives its unknown alone.
    solution[col] = rows[r]!.b.map((v) => v / rows[r]!.a[col]!);
  });
  return solution.map((exps) => {
    const parts: Record<string, number> = {};
    bases.forEach((key, k) => {
      const e = Math.round(exps[k]! * 1e9) / 1e9;
      if (e !== 0) parts[key] = e;
    });
    return dim(parts);
  });
}
