/**
 * Built-in functions and constants (docs/03-jazyk.md, ch. 7.1).
 *
 * Transcendental functions require dimensionless arguments (Calcpad does the
 * same). Angles are dimensionless in SI, so sin(30°) works.
 */

import { fail } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { dimKey, isDimensionless, powerDim, sameDim } from '../units/dimension.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asBoolean, asQuantity } from './coerce.js';

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = {
  π: Math.PI,
};

type CallExpr = Extract<Expr, { kind: 'call' }>;
type Evaluate = (expr: Expr) => Value;

/** Plain numeric functions of one dimensionless argument. */
const UNARY_DIMENSIONLESS: Readonly<Record<string, (x: number) => number>> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log10: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const DOMAINS: Readonly<Record<string, (x: number) => boolean>> = {
  asin: (x) => x >= -1 && x <= 1,
  acos: (x) => x >= -1 && x <= 1,
  ln: (x) => x > 0,
  log10: (x) => x > 0,
};

export const FUNCTION_NAMES: readonly string[] = [
  ...Object.keys(UNARY_DIMENSIONLESS), 'sqrt', 'abs', 'atan2', 'min', 'max', 'if',
];

export function callFunction(call: CallExpr, evaluate: Evaluate): Value {
  const { name, args } = call;

  // if() evaluates only the chosen branch.
  if (name === 'if') {
    arity(call, 3);
    const condition = asBoolean(evaluate(args[0]!), args[0]!.span);
    return evaluate(condition ? args[1]! : args[2]!);
  }

  const numeric = UNARY_DIMENSIONLESS[name];
  if (numeric) {
    arity(call, 1);
    const x = dimensionless(call, 0, evaluate);
    if (DOMAINS[name] && !DOMAINS[name](x)) fail('E-DOMAIN', args[0]!.span, { function: name });
    return quantity(numeric(x));
  }

  switch (name) {
    case 'sqrt': {
      arity(call, 1);
      const x = asQuantity(evaluate(args[0]!), args[0]!.span);
      if (x.si < 0) fail('E-DOMAIN', args[0]!.span, { function: name });
      return quantity(Math.sqrt(x.si), powerDim(x.dim, 0.5));
    }
    case 'abs': {
      arity(call, 1);
      const x = asQuantity(evaluate(args[0]!), args[0]!.span);
      return { ...x, si: Math.abs(x.si) };
    }
    case 'atan2': {
      arity(call, 2);
      const [y, x] = sameDimArgs(call, evaluate);
      return quantity(Math.atan2(y!.si, x!.si));
    }
    case 'min':
    case 'max': {
      if (args.length === 0) fail('E-FUNC-ARITY', call.span, { function: name, expected: '1+', found: 0 });
      const values = sameDimArgs(call, evaluate);
      const pick = name === 'min' ? (a: Quantity, b: Quantity) => (b.si < a.si ? b : a) : (a: Quantity, b: Quantity) => (b.si > a.si ? b : a);
      return values.reduce(pick);
    }
    default:
      return fail('E-FUNC-UNKNOWN', call.span, { function: name });
  }
}

function arity(call: CallExpr, expected: number): void {
  if (call.args.length !== expected) {
    fail('E-FUNC-ARITY', call.span, { function: call.name, expected, found: call.args.length });
  }
}

function dimensionless(call: CallExpr, index: number, evaluate: Evaluate): number {
  const arg = call.args[index]!;
  const q = asQuantity(evaluate(arg), arg.span);
  if (!isDimensionless(q.dim)) fail('E-FUNC-ARG-DIM', arg.span, { function: call.name, dim: dimKey(q.dim) });
  return q.si;
}

function sameDimArgs(call: CallExpr, evaluate: Evaluate): Quantity[] {
  const values = call.args.map((arg) => asQuantity(evaluate(arg), arg.span));
  const first = values[0]!;
  values.forEach((q, i) => {
    if (!sameDim(q.dim, first.dim)) {
      fail('E-UNIT-MISMATCH', call.args[i]!.span, { operator: call.name, left: dimKey(first.dim), right: dimKey(q.dim) });
    }
  });
  return values;
}
