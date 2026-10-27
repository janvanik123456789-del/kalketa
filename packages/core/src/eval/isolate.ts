/**
 * Expressing the unknown of an equation as a formula (docs/03-jazyk.md, ch. 9):
 *
 *   M_Ed == q·L²/8          ->  L = √(8·M_Ed/q)      (and −√…, sorted out by the solver)
 *   τ == 16·M/(π·d³)        ->  d = ∛(16·M/(π·τ))
 *   a·x + b == c·x + e      ->  x = (e − b)/(a − c)
 *   x² + 2·x == 8           ->  x = (−2 ± √(2² + 4·8))/2
 *
 * Not a computer algebra system: an unknown written once is undone operation
 * by operation (+ − · / ^, √, ∛, exp, ln, log10, sin, cos, tan, abs); written
 * more than once, the equation must be linear or quadratic in it. Anything
 * else returns undefined and the solver goes on numerically. The formulas
 * are plain expressions of the sheet, so they print and calculate as any other.
 */

import type { Span } from '../diagnostics.js';
import type { BinaryOperator, Expr } from '../lang/ast.js';

/** The formulas the unknown may equal (more than one where the equation has more roots), or undefined. */
export function isolate(left: Expr, right: Expr, unknown: string): Expr[] | undefined {
  const at = left.span;
  const inLeft = occurrences(left, unknown);
  const inRight = occurrences(right, unknown);
  if (inLeft + inRight === 0) return undefined;
  if (inLeft + inRight === 1) return inLeft === 1 ? undo(left, right, unknown, at) : undo(right, left, unknown, at);
  const p = polynomial(minus(left, right, at), unknown, at, 2);
  if (!p) return undefined;
  const [c0, c1, c2] = [p[0], p[1], p[2]];
  if (!c2) return c1 ? [divide(negate(c0 ?? number(0, at), at), c1, at)] : undefined;
  // a·x² + b·x + c = 0
  if (!c1) return c0 ? plusMinus(call('sqrt', [divide(negate(c0, at), c2, at)], at), at) : [number(0, at)];
  if (!c0) return [number(0, at), divide(negate(c1, at), c2, at)];
  const discriminant = minus(power(c1, number(2, at), at), times(times(number(4, at), c2, at), c0, at), at);
  const root = call('sqrt', [discriminant], at);
  const twoA = times(number(2, at), c2, at);
  return [divide(plus(negate(c1, at), root, at), twoA, at), divide(minus(negate(c1, at), root, at), twoA, at)];
}

/**
 * An equation of the second degree in the unknown as a·x² + b·x + c = 0: its
 * coefficients as written (a, b, c, or 5, −4, 10); undefined when it is none.
 */
export function quadraticOf(left: Expr, right: Expr, unknown: string): { a: Expr; b: Expr; c: Expr } | undefined {
  const at = left.span;
  const p = polynomial(minus(left, right, at), unknown, at, 2);
  if (!p || !p[2]) return undefined;
  return { a: p[2], b: p[1] ?? number(0, at), c: p[0] ?? number(0, at) };
}

/** Undoes the operations around the unknown one by one: the side with it equals the other side. */
function undo(side: Expr, other: Expr, x: string, at: Span): Expr[] | undefined {
  if (side.kind === 'variable' && side.name === x) return [other];
  const has = (e: Expr) => occurrences(e, x) > 0;
  switch (side.kind) {
    case 'unary':
      if (side.operator === 'not') return undefined;
      return undo(side.operand, side.operator === '-' ? negate(other, at) : other, x, at);
    case 'binary': {
      const { left: a, right: b } = side;
      switch (side.operator) {
        case '+':
          return has(a) ? undo(a, minus(other, b, at), x, at) : undo(b, minus(other, a, at), x, at);
        case '-':
          return has(a) ? undo(a, plus(other, b, at), x, at) : undo(b, minus(a, other, at), x, at);
        case '*':
          return has(a) ? undo(a, divide(other, b, at), x, at) : undo(b, divide(other, a, at), x, at);
        case '/':
          return has(a) ? undo(a, times(other, b, at), x, at) : undo(b, divide(a, other, at), x, at);
        case '^': {
          if (has(b)) {
            // b^x = S: x = ln(S)/ln(b).
            return has(a) ? undefined : undo(b, divide(call('ln', [other], at), call('ln', [a], at), at), x, at);
          }
          const n = b.kind === 'number' && !b.unit ? b.value : undefined;
          if (n === undefined || n === 0) return undefined;
          if (n === 1) return undo(a, other, x, at);
          const root = n === 2 ? call('sqrt', [other], at) : n === 3 ? call('cbrt', [other], at) : power(other, divide(number(1, at), number(n, at), at), at);
          // An even power has two roots: +√S and −√S.
          return Number.isInteger(n) && n % 2 === 0 ? both(a, root, x, at) : undo(a, root, x, at);
        }
        default:
          return undefined;
      }
    }
    case 'call': {
      if (side.args.length !== 1 || side.named.length > 0) return undefined;
      const arg = side.args[0]!;
      const inverse: Readonly<Record<string, (s: Expr) => Expr>> = {
        sqrt: (s) => power(s, number(2, at), at),
        cbrt: (s) => power(s, number(3, at), at),
        exp: (s) => call('ln', [s], at),
        ln: (s) => call('exp', [s], at),
        log10: (s) => power(number(10, at), s, at),
        sin: (s) => call('asin', [s], at),
        cos: (s) => call('acos', [s], at),
        tan: (s) => call('atan', [s], at),
      };
      if (side.name === 'abs') return both(arg, other, x, at);
      const f = inverse[side.name];
      return f ? undo(arg, f(other), x, at) : undefined;
    }
    default:
      return undefined;
  }
}

/** Both signs: |a| = S and a² = S give a = S and a = −S. */
function both(side: Expr, value: Expr, x: string, at: Span): Expr[] | undefined {
  const positive = undo(side, value, x, at);
  const negative = undo(side, negate(value, at), x, at);
  return positive && negative ? [...positive, ...negative] : undefined;
}

function plusMinus(value: Expr, at: Span): Expr[] {
  return [value, negate(value, at)];
}

/**
 * The coefficients c0, c1, c2 of an expression of degree two at most in x
 * (undefined for a coefficient that is zero), or undefined when it is none.
 */
/** The coefficients c0 … cn of a polynomial in x up to degree `max` (undefined for zero ones), or undefined. */
export function polynomialCoefficients(expr: Expr, x: string, max: number): (Expr | undefined)[] | undefined {
  return polynomial(expr, x, expr.span, max);
}

function polynomial(expr: Expr, x: string, at: Span, max: number): (Expr | undefined)[] | undefined {
  if (occurrences(expr, x) === 0) return [expr];
  switch (expr.kind) {
    case 'variable':
      return expr.name === x ? [undefined, number(1, at)] : [expr];
    case 'unary': {
      if (expr.operator === 'not') return undefined;
      const p = polynomial(expr.operand, x, at, max);
      return p && (expr.operator === '-' ? p.map((c) => (c ? negate(c, at) : c)) : p);
    }
    case 'binary': {
      const a = polynomial(expr.left, x, at, max);
      const b = expr.operator === '^' ? undefined : polynomial(expr.right, x, at, max);
      switch (expr.operator) {
        case '+':
        case '-':
          if (!a || !b) return undefined;
          return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => combine(a[i], b[i], expr.operator as '+' | '-', at));
        case '*': {
          if (!a || !b || a.length + b.length - 2 > max) return undefined;
          const out: (Expr | undefined)[] = [];
          a.forEach((ca, i) => b.forEach((cb, j) => (out[i + j] = ca && cb ? combine(out[i + j], times(ca, cb, at), '+', at) : out[i + j])));
          return out;
        }
        case '/':
          // Only by something without x: each coefficient divided.
          if (!a || occurrences(expr.right, x) > 0) return undefined;
          return a.map((c) => (c ? divide(c, expr.right, at) : c));
        case '^': {
          // A whole power: a product of the base with itself.
          const n = expr.right.kind === 'number' && !expr.right.unit ? expr.right.value : undefined;
          if (!a || n === undefined || !Number.isInteger(n) || n < 1 || (a.length - 1) * n > max) return undefined;
          let product: Expr = expr.left;
          for (let i = 1; i < n; i++) product = { kind: 'binary', operator: '*', left: product, right: expr.left, span: expr.span };
          return n === 1 ? a : polynomial(product, x, at, max);
        }
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

function combine(a: Expr | undefined, b: Expr | undefined, op: '+' | '-', at: Span): Expr | undefined {
  if (!b) return a;
  if (!a) return op === '+' ? b : negate(b, at);
  return op === '+' ? plus(a, b, at) : minus(a, b, at);
}

/** How often a name is used in an expression. */
export function occurrences(expr: Expr, name: string): number {
  switch (expr.kind) {
    case 'variable':
      return expr.name === name ? 1 : 0;
    case 'unary':
      return occurrences(expr.operand, name);
    case 'binary':
      return occurrences(expr.left, name) + occurrences(expr.right, name);
    case 'call':
      return expr.args.reduce((n, a) => n + occurrences(a, name), 0) + expr.named.reduce((n, a) => n + occurrences(a.value, name), 0);
    case 'member':
      return occurrences(expr.object, name);
    case 'vector':
      return expr.items.reduce((n, a) => n + occurrences(a, name), 0);
    case 'index':
      return occurrences(expr.object, name) + occurrences(expr.index, name);
    default:
      return 0;
  }
}

// Building expressions, with the obvious simplifications (0 + a = a, 1·a = a …),
// so the formula reads as one would write it.

function number(value: number, span: Span): Expr {
  return { kind: 'number', value, span };
}

const isNumber = (e: Expr, value: number) => e.kind === 'number' && !e.unit && !e.imaginary && e.value === value;

function binary(operator: BinaryOperator, left: Expr, right: Expr, span: Span): Expr {
  return { kind: 'binary', operator, left, right, span };
}

function plus(a: Expr, b: Expr, at: Span): Expr {
  if (isNumber(a, 0)) return b;
  if (isNumber(b, 0)) return a;
  if (b.kind === 'unary' && b.operator === '-') return minus(a, b.operand, at);
  return binary('+', a, b, at);
}

function minus(a: Expr, b: Expr, at: Span): Expr {
  if (isNumber(b, 0)) return a;
  if (isNumber(a, 0)) return negate(b, at);
  if (b.kind === 'unary' && b.operator === '-') return plus(a, b.operand, at);
  return binary('-', a, b, at);
}

function times(a: Expr, b: Expr, at: Span): Expr {
  if (isNumber(a, 1)) return b;
  if (isNumber(b, 1)) return a;
  // A plain number goes first: 8·M, not M·8.
  if (b.kind === 'number' && !b.unit && a.kind !== 'number') return binary('*', b, a, at);
  return binary('*', a, b, at);
}

function divide(a: Expr, b: Expr, at: Span): Expr {
  if (isNumber(b, 1)) return a;
  // a/b/c reads as a/(b·c).
  if (a.kind === 'binary' && a.operator === '/') return binary('/', a.left, times(a.right, b, at), at);
  // −a/b reads better than a/(−b); the minus of the numerator goes before the fraction, where two minuses cancel (not −−D/…).
  if (b.kind === 'unary' && b.operator === '-') return negate(divide(a, b.operand, at), at);
  if (a.kind === 'unary' && a.operator === '-') return negate(divide(a.operand, b, at), at);
  return binary('/', a, b, at);
}

function power(a: Expr, b: Expr, at: Span): Expr {
  if (isNumber(b, 1)) return a;
  return binary('^', a, b, at);
}

function negate(a: Expr, at: Span): Expr {
  if (a.kind === 'unary' && a.operator === '-') return a.operand;
  if (a.kind === 'number' && !a.unit) return { ...a, value: -a.value };
  return { kind: 'unary', operator: '-', operand: a, span: at };
}

function call(name: string, args: Expr[], at: Span): Expr {
  return { kind: 'call', name, args, named: [], span: at };
}
