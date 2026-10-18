/**
 * Built-in functions and constants (docs/03-jazyk.md, ch. 7.1).
 *
 * The functions themselves live in modules (functions/modules.ts) collected in
 * a registry; this file joins the registry to the evaluator.
 */

import { CALCULUS, CHARTS, COMPLEX, DATES, FINANCE, LOGIC, MATH, SERIES, STATISTICS, TABLES, TRIG } from '../functions/modules.js';
import { FunctionRegistry, type CallExpr, type Evaluate } from '../functions/registry.js';
import { LINEAR } from '../functions/linear.js';
import { INTERPOLATION } from '../functions/interpolation.js';
import type { Value } from '../values/value.js';

export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = {
  π: Math.PI,
};

/** All built-in functions, table functions included (they are only described here). */
export const builtinFunctions = new FunctionRegistry([MATH, TRIG, CALCULUS, LINEAR, COMPLEX, SERIES, INTERPOLATION, STATISTICS, FINANCE, DATES, LOGIC, TABLES, CHARTS]);

/** Functions that compute from plain arguments (not table functions). */
export const FUNCTION_NAMES: readonly string[] = builtinFunctions
  .all()
  .filter((def) => def.call)
  .map((def) => def.name);

export function callFunction(call: CallExpr, evaluate: Evaluate): Value {
  return builtinFunctions.call(call, evaluate);
}
