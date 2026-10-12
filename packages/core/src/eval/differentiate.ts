/**
 * The derivative of a formula by one of its names, as written by hand:
 * (a·x² + b·x + c)′ = 2·a·x + b. Sums, products, quotients, whole and other
 * constant powers, √, sin, cos, tan, exp and ln; anything else gives undefined
 * and the caller goes on numerically. The result is a plain expression of the
 * sheet, simplified so it prints as a person would write it.
 */

import type { Span } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';

export function differentiate(expr: Expr, x: string): Expr | undefined {
  const at = expr.span;
  const d = (e: Expr) => differentiate(e, x);
  if (!uses(expr, x)) return num(0, at);
  switch (expr.kind) {
    case 'variable':
      return num(expr.name === x ? 1 : 0, at);
    case 'unary': {
      if (expr.operator === 'not' || expr.operator === '±') return undefined;
      const inner = d(expr.operand);
      return inner && (expr.operator === '-' ? neg(inner, at) : inner);
    }
    case 'binary': {
      const [u, v] = [expr.left, expr.right];
      switch (expr.operator) {
        case '+':
        case '-': {
          const [du, dv] = [d(u), d(v)];
          if (!du || !dv) return undefined;
          return expr.operator === '+' ? plus(du, dv, at) : minus(du, dv, at);
        }
        case '*': {
          const [du, dv] = [d(u), d(v)];
          if (!du || !dv) return undefined;
          return plus(times(du, v, at), times(u, dv, at), at);
        }
        case '/': {
          const [du, dv] = [d(u), d(v)];
          if (!du || !dv) return undefined;
          // A constant divisor stays below: (u/c)′ = u′/c.
          if (!uses(v, x)) return divide(du, v, at);
          return divide(minus(times(du, v, at), times(u, dv, at), at), power(v, num(2, at), at), at);
        }
        case '^': {
          if (uses(v, x)) return undefined;
          const du = d(u);
          if (!du) return undefined;
          // (uⁿ)′ = n·uⁿ⁻¹·u′
          const n = v.kind === 'number' && !v.unit ? num(v.value - 1, at) : minus(v, num(1, at), at);
          return times(times(v, power(u, n, at), at), du, at);
        }
        default:
          return undefined;
      }
    }
    case 'call': {
      if (expr.args.length !== 1 || expr.named.length > 0) return undefined;
      const u = expr.args[0]!;
      const du = d(u);
      if (!du) return undefined;
      const call = (name: string, arg: Expr): Expr => ({ kind: 'call', name, args: [arg], named: [], span: at });
      const outer: Record<string, (() => Expr) | undefined> = {
        sqrt: () => divide(num(1, at), times(num(2, at), call('sqrt', u), at), at),
        sin: () => call('cos', u),
        cos: () => neg(call('sin', u), at),
        tan: () => divide(num(1, at), power(call('cos', u), num(2, at), at), at),
        exp: () => call('exp', u),
        ln: () => divide(num(1, at), u, at),
      };
      const f = outer[expr.name];
      return f ? times(f(), du, at) : undefined;
    }
    default:
      return undefined;
  }
}

function uses(e: Expr, x: string): boolean {
  switch (e.kind) {
    case 'variable':
      return e.name === x;
    case 'unary':
      return uses(e.operand, x);
    case 'binary':
      return uses(e.left, x) || uses(e.right, x);
    case 'call':
      return e.args.some((a) => uses(a, x)) || e.named.some((n) => uses(n.value, x));
    case 'prime':
      return !!e.arg && uses(e.arg, x);
    default:
      return false;
  }
}

const num = (value: number, span: Span): Expr => ({ kind: 'number', value, span });
const isNum = (e: Expr, value?: number) => e.kind === 'number' && !e.unit && !e.imaginary && (value === undefined || e.value === value);
const value = (e: Expr) => (e.kind === 'number' ? e.value : NaN);

function neg(a: Expr, at: Span): Expr {
  if (isNum(a)) return num(-value(a), at);
  if (a.kind === 'unary' && a.operator === '-') return a.operand;
  return { kind: 'unary', operator: '-', operand: a, span: at };
}

function plus(a: Expr, b: Expr, at: Span): Expr {
  if (isNum(a, 0)) return b;
  if (isNum(b, 0)) return a;
  if (isNum(a) && isNum(b)) return num(value(a) + value(b), at);
  if (b.kind === 'unary' && b.operator === '-') return minus(a, b.operand, at);
  return { kind: 'binary', operator: '+', left: a, right: b, span: at };
}

function minus(a: Expr, b: Expr, at: Span): Expr {
  if (isNum(b, 0)) return a;
  if (isNum(a, 0)) return neg(b, at);
  if (isNum(a) && isNum(b)) return num(value(a) - value(b), at);
  return { kind: 'binary', operator: '-', left: a, right: b, span: at };
}

/** A product with its plain numbers in front and multiplied together: a·(2·x) is 2·a·x. */
function times(a: Expr, b: Expr, at: Span): Expr {
  if (isNum(a, 0) || isNum(b, 0)) return num(0, at);
  if (isNum(a, 1)) return b;
  if (isNum(b, 1)) return a;
  if (isNum(a) && isNum(b)) return num(value(a) * value(b), at);
  if (isNum(b)) return times(b, a, at);
  const lead = (e: Expr) => (e.kind === 'binary' && e.operator === '*' && isNum(e.left) ? { n: value(e.left), rest: e.right } : undefined);
  const lb = lead(b);
  if (lb) return times(num(isNum(a) ? value(a) * lb.n : lb.n, at), isNum(a) ? lb.rest : times(a, lb.rest, at), at);
  const la = lead(a);
  if (la && !isNum(b)) return times(num(la.n, at), times(la.rest, b, at), at);
  return { kind: 'binary', operator: '*', left: a, right: b, span: at };
}

function divide(a: Expr, b: Expr, at: Span): Expr {
  if (isNum(a, 0)) return num(0, at);
  if (isNum(b, 1)) return a;
  return { kind: 'binary', operator: '/', left: a, right: b, span: at };
}

function power(a: Expr, n: Expr, at: Span): Expr {
  if (isNum(n, 1)) return a;
  if (isNum(n, 0)) return num(1, at);
  return { kind: 'binary', operator: '^', left: a, right: n, span: at };
}
