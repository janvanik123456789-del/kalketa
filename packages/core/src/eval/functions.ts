/**
 * Built-in functions and constants (docs/03-jazyk.md, ch. 7.1).
 *
 * The functions themselves live in modules (functions/modules.ts) collected in
 * a registry; this file joins the registry to the evaluator.
 */

import { CALCULUS, CHARTS, COMPLEX, DATES, FINANCE, LOGIC, MATH, SERIES, STATISTICS, TABLES, TRIG } from '../functions/modules.js';
import { FunctionRegistry, type CallExpr, type Evaluate, type FunctionDef } from '../functions/registry.js';
import { LINEAR } from '../functions/linear.js';
import { STRUCTURES } from '../functions/structures.js';
import { INTERPOLATION } from '../functions/interpolation.js';
import type { Diagnostic } from '../diagnostics.js';
import type { Value } from '../values/value.js';

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = {
  π: Math.PI,
};

/** Functions of numbers that take a series item by item, written apart from what each computes. */
const ITEMWISE: ReadonlySet<string> = new Set([
  'sqrt', 'cbrt', 'root', 'abs', 'hypot', 'mod', 'sign', 'floor', 'ceil', 'round', 'log', 'factorial', 'atan2',
  're', 'im', 'conj', 'arg',
  'normcdf', 'norminv', 'tcdf', 'tinv', 'chi2cdf', 'chi2inv', 'fcdf', 'finv', 'nchoosek', 'binopdf', 'binocdf', 'poisspdf', 'poisscdf',
]);
const itemwise = (defs: readonly FunctionDef[]): FunctionDef[] => defs.map((def) => (ITEMWISE.has(def.name) ? { ...def, itemwise: true } : def));

/** All built-in functions, table functions included (they are only described here). */
export const builtinFunctions = new FunctionRegistry([MATH, TRIG, CALCULUS, STRUCTURES, LINEAR, COMPLEX, SERIES, INTERPOLATION, STATISTICS, FINANCE, DATES, LOGIC, TABLES, CHARTS].map(itemwise));

/** Functions that compute from plain arguments (not table functions). */
export const FUNCTION_NAMES: readonly string[] = builtinFunctions
  .all()
  .filter((def) => def.call)
  .map((def) => def.name);
/** The same as a set: asked at every call of a function (inside an integral, many thousand times). */
export const FUNCTION_NAME_SET: ReadonlySet<string> = new Set(FUNCTION_NAMES);

export function callFunction(call: CallExpr, evaluate: Evaluate, warn?: (warning: Diagnostic) => void): Value {
  return builtinFunctions.call(call, evaluate, warn);
}
