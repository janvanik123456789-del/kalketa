/**
 * Registry of built-in functions (docs/03-jazyk.md, ch. 7.1).
 *
 * Every function is a description: its name, the module it belongs to, its
 * parameters for help, how many arguments it takes, and how it computes. The
 * evaluator only looks functions up here, so a module of functions (statistics,
 * a field's own library, later a plug-in) is added without touching the core.
 */

import { fail, type Diagnostic } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { isDimensionless, sameDim } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import type { Quantity, Value } from '../values/value.js';
import { asComplex, asQuantity } from '../eval/coerce.js';

export type FunctionModuleId = 'math' | 'trig' | 'calculus' | 'linear' | 'complex' | 'series' | 'statistics' | 'finance' | 'dates' | 'logic' | 'tables' | 'charts';

/** Modules in the order help lists them. */
export const FUNCTION_MODULES: readonly FunctionModuleId[] = ['math', 'trig', 'calculus', 'linear', 'complex', 'series', 'statistics', 'finance', 'dates', 'logic', 'tables', 'charts'];

export type CallExpr = Extract<Expr, { kind: 'call' }>;
export type Evaluate = (expr: Expr) => Value;

export interface FunctionDef {
  readonly name: string;
  readonly module: FunctionModuleId;
  /** Parameters as help writes them: "x", "y, x", "a, b, …". */
  readonly params: string;
  /** Least and most arguments (Infinity: any number). */
  readonly arity: readonly [number, number];
  /** Absent for functions the evaluator handles itself (table functions). */
  readonly call?: (args: Args) => Value;
  /** Takes numbers: given a series it goes item by item, other arguments staying (tcdf(t, 5)). */
  readonly itemwise?: boolean;
}

/**
 * Functions that read complex items of a series or a matrix as they are. Any other reads their real numbers, and a
 * complex item would lose its other part without a word, so it is refused.
 */
const TAKES_COMPLEX_ITEMS: ReadonlySet<string> = new Set([
  'sum', 'mean', 'len', 'reverse', 'last', 'lsolve', 'det', 'inverse', 'eigenvals', 'eigenvecs', 'transpose', 'row', 'col', 'diag', 'rows', 'cols', 'submatrix', 'augment', 'stack', 'scatter',
  'exp', 'ln', 'log10', 'log2', 'sin', 'cos', 'tan', 'tg', 'sinh', 'cosh', 'tanh', 'if',
]);

/** The arguments of one call, read the way a function needs them. */
export class Args {
  constructor(
    readonly call: CallExpr,
    private readonly evaluateArg: Evaluate,
    /** The arguments already evaluated, one item of a series in place of the series. */
    private readonly given?: readonly Value[],
    /** Says something about the result (a spline beyond its points, a matrix hardly solvable). */
    readonly warn: (warning: Diagnostic) => void = () => {},
  ) {}

  get name(): string {
    return this.call.name;
  }

  get count(): number {
    return this.call.args.length;
  }

  expr(index: number): Expr {
    return this.call.args[index]!;
  }

  value(index: number): Value {
    const value = this.given?.[index] ?? this.evaluateArg(this.expr(index));
    if ((value.type === 'vector' || value.type === 'matrix') && !TAKES_COMPLEX_ITEMS.has(this.name) && value.items.some((q) => q.im)) fail('E-COMPLEX-ARG', this.expr(index).span);
    return value;
  }

  /** Any part of an argument (the sides of a comparison in if()). */
  evaluate(expr: Expr): Value {
    return this.evaluateArg(expr);
  }

  /** A real number with a unit. */
  quantity(index: number): Quantity {
    return asQuantity(this.value(index), this.expr(index).span);
  }

  /** A number that may be complex. */
  complex(index: number): Quantity {
    return asComplex(this.value(index), this.expr(index).span);
  }

  /** A plain number (angles count as plain numbers in SI). */
  number(index: number): number {
    const q = this.quantity(index);
    if (!isDimensionless(q.dim)) fail('E-FUNC-ARG-DIM', this.expr(index).span, { function: this.name, dim: baseUnitSymbol(q.dim) });
    return q.si;
  }

  /** A series: a table column or [a, b, c]. */
  series(index: number): readonly Quantity[] {
    const value = this.value(index);
    // [1 | 2 | 3] and transpose of a series are one too.
    const items = value.type === 'matrix' && (value.cols === 1 || value.rows === 1) ? value.items : value.type === 'vector' ? value.items : fail('E-TYPE', this.expr(index).span, { expected: 'vector', found: value.type === 'quantity' ? 'number' : value.type });
    return items;
  }

  /** One series, or any numbers and series in a row: sum(1, 2, 3), mean(x, y). */
  items(): readonly Quantity[] {
    if (this.count === 1) return this.series(0);
    const all = this.call.args.flatMap((_, i) => {
      const value = this.value(i);
      return value.type === 'vector' ? value.items : [this.quantity(i)];
    });
    const other = all.find((q) => !sameDim(q.dim, all[0]!.dim));
    if (other) fail('E-UNIT-MISMATCH', this.call.span, { operator: this.name, left: baseUnitSymbol(all[0]!.dim), right: baseUnitSymbol(other.dim) });
    return all;
  }

  /** All arguments from `from` on as numbers of one dimension. */
  sameDimension(from = 0, to = this.count): Quantity[] {
    const values: Quantity[] = [];
    for (let i = from; i < to; i++) values.push(this.quantity(i));
    const first = values[0];
    values.forEach((q, i) => {
      if (first && !sameDim(q.dim, first.dim)) {
        fail('E-UNIT-MISMATCH', this.expr(from + i).span, { operator: this.name, left: baseUnitSymbol(first.dim), right: baseUnitSymbol(q.dim) });
      }
    });
    return values;
  }

  /** Fails with "outside the domain" at argument `index` (or the whole call). */
  domain(index?: number): never {
    return fail('E-DOMAIN', index === undefined ? this.call.span : this.expr(index).span, { function: this.name });
  }
}

export class FunctionRegistry {
  private readonly defs = new Map<string, FunctionDef>();

  constructor(modules: readonly (readonly FunctionDef[])[] = []) {
    for (const module of modules) this.add(module);
  }

  add(defs: readonly FunctionDef[]): void {
    for (const def of defs) this.defs.set(def.name, def);
  }

  get(name: string): FunctionDef | undefined {
    return this.defs.get(name);
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  /** All functions, for help: by module, then by name. */
  all(): FunctionDef[] {
    return [...this.defs.values()].sort((a, b) => FUNCTION_MODULES.indexOf(a.module) - FUNCTION_MODULES.indexOf(b.module) || a.name.localeCompare(b.name, 'en'));
  }

  /** Evaluates a call of a function that computes itself (not a table function). */
  call(call: CallExpr, evaluate: Evaluate, warn?: (warning: Diagnostic) => void): Value {
    const def = this.defs.get(call.name);
    if (!def?.call) return fail('E-FUNC-UNKNOWN', call.span, { function: call.name });
    const [min, max] = def.arity;
    const found = call.args.length;
    if (found < min || found > max) {
      const expected = min === max ? min : max === Infinity ? `${min}+` : `${min}–${max}`;
      fail('E-FUNC-ARITY', call.span, { function: call.name, expected, found });
    }
    if (!def.itemwise) return def.call(new Args(call, evaluate, undefined, warn));
    const given = call.args.map((arg) => evaluate(arg));
    const series = given.filter((v) => v.type === 'vector');
    if (series.length === 0) return def.call(new Args(call, evaluate, given, warn));
    const n = series[0]!.items.length;
    const other = series.find((v) => v.items.length !== n);
    if (other) fail('E-VECTOR-LENGTH', call.span, { left: n, right: other.items.length });
    const items = Array.from({ length: n }, (_, i) => asQuantity(def.call!(new Args(call, evaluate, given.map((v) => (v.type === 'vector' ? v.items[i]! : v)), warn)), call.span));
    return { type: 'vector', items };
  }
}

/** "sin(x)" in the notation of the sheet (";" between arguments with a decimal comma). */
export function signature(def: FunctionDef, separator = ','): string {
  return `${def.name}(${separator === ',' ? def.params : def.params.replaceAll(', ', `${separator} `)})`;
}
