/**
 * Equation solver (docs/03-jazyk.md, ch. 9):
 *
 *   solve x: x² + 2·x == 8 in 0 .. 10            one unknown in an interval
 *   solve (I_1, I_2):                             a system, from a first guess
 *       U_1 == R_1·I_1 + R_3·(I_1 - I_2)
 *       U_2 == R_2·I_2 + R_3·(I_2 - I_1)
 *       guess I_1 = 1 A, I_2 = 1 A
 *
 * One unknown is first expressed as a formula (eval/isolate.ts): L = √(8·M/q)
 * then calculates like any formula, takes its unit from it and prints. Where
 * that is not possible (x·eˣ = 3, systems) the solver works numerically.
 * Of more roots the interval picks, else the first guess, else the only
 * positive one; two positive ones without either is an error naming both.
 *
 * One unknown in an interval: a bracketing method (regula falsi with the
 * Anderson–Björck correction, as Calcpad's $Root); it always finds a root when
 * the interval has a sign change. Otherwise Newton–Raphson with a numerical
 * Jacobian and a damped step. Units are checked like anywhere else: both sides
 * of an equation must have the same dimension, and the unknowns take the
 * dimension of their interval or first guess. No solution is an error with an
 * explanation, never a silent NaN.
 */

import { CalcError, fail, type Span } from '../diagnostics.js';
import type { Expr, Inequality, SolveDomain, Statement } from '../lang/ast.js';
import { isDimensionless, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { DIMENSIONLESS } from '../units/dimension.js';
import type { ResolvedUnit } from '../units/unitExpr.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import { asQuantity } from './coerce.js';
import type { EvalContext } from './evaluator.js';
import { isBareZero, withBareZero } from './zero.js';
import { isolate, quadraticOf } from './isolate.js';
import { substitute } from './derive.js';
import { differentiate } from './differentiate.js';
import { toDisplay } from '../units/display.js';

type SolveStatement = Extract<Statement, { kind: 'solve' }>;
type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

const MAX_ITERATIONS = 200;
const RESIDUAL_TOLERANCE = 1e-10;
/** Where an equation has no value (x/0, ln(-1), overflow): skipped, not an error. */
const UNDEFINED_POINT: ReadonlySet<string> = new Set(['E-DOMAIN', 'E-DIV-ZERO', 'E-NOT-FINITE']);
/** Sub-intervals searched for a sign change when the ends of the interval have the same sign. */
const SCAN_STEPS = 64;

interface Unknown {
  readonly name: string;
  readonly dim: Dimension;
  readonly hint?: ResolvedUnit;
  readonly absolute?: boolean;
}

/** What a solve statement found: the unknowns in the order they were written. */
export interface Solved {
  readonly values: Quantity[];
  /** The formula a single unknown was expressed by; absent when it was found numerically. */
  readonly formula?: Expr;
  /**
   * From an inequality: on which side of the value found the solutions lie,
   * S ≤ π·d²/4 -> d ≥ … (the value is the bound: the least d).
   */
  readonly relation?: Inequality;
  /** The equation with the functions of the sheet written out: y′(x) = 0 is 2·a·x + b = 0. */
  readonly expanded?: { readonly left: Expr; readonly right: Expr };
}

/** Solves the statement; an inequality for its bound, then the side of the solutions. */
export function solveStatement(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate): Solved {
  const solved = solveEquations(statement, ctx, evaluate);
  const relation = statement.equations[0]?.relation;
  return relation ? { ...solved, relation: sideOf(statement, relation, solved.values[0]!, ctx, evaluate) } : solved;
}

/**
 * Which side of the bound x₀ satisfies the inequality, tried just above and
 * just below it: S ≤ π·d²/4 holds for d above its bound, so d ≥ d₀.
 */
function sideOf(statement: SolveStatement, relation: Inequality, bound: Quantity, ctx: EvalContext, evaluate: Evaluate): Inequality {
  const name = statement.unknowns[0]!.name;
  const equation = statement.equations[0]!;
  const quiet: EvalContext = { ...ctx, warnings: [], tableReads: [] };
  const holds = (si: number): boolean | undefined => {
    const at: EvalContext = { ...quiet, lookup: (n, span) => (n === name ? { ...bound, si } : ctx.lookup(n, span)) };
    try {
      const left = asQuantity(evaluate(equation.left, at), equation.left.span);
      const right = asQuantity(evaluate(equation.right, at), equation.right.span);
      const d = left.si - right.si;
      return relation === '<' ? d < 0 : relation === '<=' ? d <= 0 : relation === '>' ? d > 0 : d >= 0;
    } catch (err) {
      if (err instanceof CalcError) return undefined;
      throw err;
    }
  };
  const step = Math.max(Math.abs(bound.si) * 1e-4, 1e-12);
  const above = holds(bound.si + step);
  const below = holds(bound.si - step);
  const strict = relation === '<' || relation === '>';
  if (above && !below) return strict ? '>' : '>=';
  if (below && !above) return strict ? '<' : '<=';
  return fail('E-SOLVE-SIDE', statement.span, { name });
}

function solveEquations(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate): Solved {
  const { unknowns, equations } = statement;
  if (equations.length !== unknowns.length) {
    fail('E-SOLVE-COUNT', statement.span, { unknowns: unknowns.length, equations: equations.length });
  }

  // Guesses and the interval give the unknowns their dimension and unit.
  const guesses = new Map<string, Quantity>();
  for (const g of statement.guesses) {
    if (!unknowns.some((u) => u.name === g.name)) fail('E-NAMED-ARG', g.nameSpan, { function: 'solve', argument: g.name, problem: 'unknown' });
    guesses.set(g.name, asQuantity(evaluate(g.value, ctx), g.value.span));
  }
  let range: [Quantity, Quantity] | undefined;
  if (statement.range) {
    const low = asQuantity(evaluate(statement.range.low, ctx), statement.range.low.span);
    const high = asQuantity(evaluate(statement.range.high, ctx), statement.range.high.span);
    if (!sameDim(low.dim, high.dim)) {
      fail('E-UNIT-MISMATCH', statement.range.high.span, { operator: '..', left: baseUnitSymbol(low.dim), right: baseUnitSymbol(high.dim) });
    }
    range = low.si <= high.si ? [low, high] : [high, low];
  }
  const shape: Unknown[] = unknowns.map((u) => {
    const from = guesses.get(u.name) ?? range?.[0];
    return { name: u.name, dim: from?.dim ?? DIMENSIONLESS, ...(from?.hint ? { hint: from.hint } : {}), ...(from?.absolute ? { absolute: true } : {}) };
  });

  const values = (x: readonly number[]): Quantity[] =>
    shape.map((u, i) => quantity(x[i]!, u.dim, { ...(u.hint ? { hint: u.hint } : {}), ...(u.absolute ? { absolute: true } : {}) }));

  // Iterations run quietly: warnings and table reads count only for the solution.
  const quiet: EvalContext = { registry: ctx.registry, warnings: [], ...(ctx.blocks ? { blocks: ctx.blocks } : {}), lookup: ctx.lookup };
  const residuals = (x: readonly number[], context: EvalContext = quiet): { r: number[]; scale: number[] } => {
    const given = values(x);
    const inner: EvalContext = {
      ...context,
      lookup: (name: string, span: Span) => {
        const index = shape.findIndex((u) => u.name === name);
        return index === -1 ? context.lookup(name, span) : given[index]!;
      },
    };
    const r: number[] = [];
    const scale: number[] = [];
    for (const eq of equations) {
      // "δ_10 + δ_11·X_1 == 0": a zero written without a unit is one of the other side's.
      const [left, right] = withBareZero(asQuantity(evaluate(eq.left, inner), eq.left.span), asQuantity(evaluate(eq.right, inner), eq.right.span), eq.left, eq.right);
      if (!sameDim(left.dim, right.dim)) {
        fail('E-UNIT-MISMATCH', eq.span, { operator: '==', left: baseUnitSymbol(left.dim), right: baseUnitSymbol(right.dim) });
      }
      r.push(left.si - right.si);
      // Against a zero ("δ_10 + δ_11·X_1 == 0") the side itself goes to zero at the root: its terms tell how small is small.
      const zero = isBareZero(eq.right) ? eq.left : isBareZero(eq.left) ? eq.right : undefined;
      const terms = zero ? termsOf(zero).reduce((sum, term) => sum + Math.abs(asQuantity(evaluate(term, inner), term.span).si), 0) : 0;
      scale.push(Math.max(Math.abs(left.si), Math.abs(right.si), terms, Number.MIN_VALUE));
    }
    return { r, scale };
  };

  if (unknowns.length === 1) {
    const found = byFormula(statement, ctx, evaluate, range, guesses.get(unknowns[0]!.name));
    if (found) return found;
  }

  const start = shape.map((u) => guesses.get(u.name)?.si ?? range?.[0].si ?? 1);
  const x = range && unknowns.length === 1 ? [bracketed(range[0].si, range[1].si, (v) => residuals([v]), statement.span)] : withMoreStarts(start, unknowns.map((u) => guesses.has(u.name)), (s) => newton(s, residuals, statement.span));

  // The solution once more, with warnings and table reads recorded.
  residuals(x, ctx);
  return { values: values(x) };
}

/**
 * One unknown expressed as a formula, or undefined to go on numerically. Every
 * root is put back into the equation; the interval, the guess or the sign picks one.
 */
function byFormula(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate, range: [Quantity, Quantity] | undefined, guess: Quantity | undefined): Solved | undefined {
  const name = statement.unknowns[0]!.name;
  const equation = statement.equations[0]!;
  const [inLeft, inRight] = [inlineCalls(equation.left, ctx), inlineCalls(equation.right, ctx)];
  const expanded = inLeft !== equation.left || inRight !== equation.right ? { left: inLeft, right: inRight } : undefined;
  const formulas = isolate(inLeft, inRight, name);
  if (!formulas) return undefined;
  const quiet: EvalContext = { ...ctx, warnings: [], tableReads: [] };
  const holds = (value: Quantity): boolean => rootHolds(equation, name, value, ctx, evaluate);
  const roots: { value: Quantity; formula: Expr }[] = [];
  for (const formula of formulas) {
    let value: Value;
    try {
      value = evaluate(formula, quiet);
    } catch (err) {
      // A root outside the domain (√ of a negative number): not a root.
      if (err instanceof CalcError) continue;
      throw err;
    }
    if (value.type !== 'quantity' || value.im || !Number.isFinite(value.si)) continue;
    if (roots.some((r) => Math.abs(r.value.si - value.si) <= 1e-12 * Math.max(Math.abs(value.si), 1e-300))) continue;
    if (holds(value)) roots.push({ value, formula });
  }
  if (roots.length === 0) return undefined;

  let chosen: { value: Quantity; formula: Expr } | undefined;
  if (range) {
    const [low, high] = range;
    const margin = 1e-12 * Math.max(Math.abs(low.si), Math.abs(high.si));
    const inside = roots.filter((r) => sameDim(r.value.dim, low.dim) && r.value.si >= low.si - margin && r.value.si <= high.si + margin);
    // As the bracketing method: the root nearest the lower end.
    chosen = inside.sort((a, b) => a.value.si - b.value.si)[0];
    if (!chosen) return undefined;
  } else if (guess) {
    const same = roots.filter((r) => sameDim(r.value.dim, guess.dim));
    chosen = same.sort((a, b) => Math.abs(a.value.si - guess.si) - Math.abs(b.value.si - guess.si))[0];
    if (!chosen) return undefined;
  } else if (roots.length === 1) {
    chosen = roots[0];
  } else {
    const positive = roots.filter((r) => r.value.si > 0);
    if (positive.length !== 1) {
      const shown = roots.map((r) => {
        const d = toDisplay(r.value, ctx.registry);
        return `${Number(d.value.toPrecision(4))}${d.unit ? ` ${d.unit}` : ''}`;
      });
      fail('E-SOLVE-ROOTS', statement.span, { name, roots: shown.join('; ') });
    }
    chosen = positive[0];
  }
  // Once more with warnings and table reads recorded; the unit of the interval or guess is kept.
  const value = asQuantity(evaluate(chosen!.formula, ctx), statement.span);
  const hint = range?.[0].hint ?? guess?.hint;
  return { values: [hint && sameDim(hint.dim, value.dim) ? { ...value, hint } : value], formula: chosen!.formula, ...(expanded ? { expanded } : {}) };
}

/**
 * A value is a root when the two sides are equal but for rounding: compared with
 * the sides themselves, or (where a side is 0, as in a·x² + b·x + c = 0) with how
 * much the difference changes when the value does.
 */
function rootHolds(equation: SolveStatement['equations'][number], name: string, value: Quantity, ctx: EvalContext, evaluate: Evaluate): boolean {
  const quiet: EvalContext = { ...ctx, warnings: [], tableReads: [] };
  const sides = (v: Quantity) => {
    const at: EvalContext = { ...quiet, lookup: (n, span) => (n === name ? v : ctx.lookup(n, span)) };
    const [left, right] = withBareZero(asQuantity(evaluate(equation.left, at), equation.left.span), asQuantity(evaluate(equation.right, at), equation.right.span), equation.left, equation.right);
    if (!sameDim(left.dim, right.dim)) fail('E-UNIT-MISMATCH', equation.span, { operator: '==', left: baseUnitSymbol(left.dim), right: baseUnitSymbol(right.dim) });
    return { d: Math.hypot(left.si - right.si, (left.im ?? 0) - (right.im ?? 0)), scale: Math.max(Math.hypot(left.si, left.im ?? 0), Math.hypot(right.si, right.im ?? 0)) };
  };
  const here = sides(value);
  if (here.d <= 1e-9 * Math.max(here.scale, Number.MIN_VALUE)) return true;
  const size = Math.hypot(value.si, value.im ?? 0);
  const h = size * 1e-6 || 1e-9;
  const slope = Math.abs(sides({ ...value, si: value.si + h }).d - here.d) / h;
  return slope > 0 && here.d / slope <= 1e-7 * Math.max(size, 1e-12);
}

/** A root found under the conditions of the statement, or why it was set aside. */
export interface Root {
  readonly value: Quantity;
  /**
   * Not a solution after all: complex where only real ones count, not a whole number where only those count
   * (ℕ, ℕ₀, ℤ: 'domain'), or failing a condition (its index; the interval after them).
   */
  readonly rejected?: 'complex' | 'domain' | number;
}

/** solve x ∈ ℝ, x > 0: … — every root, each kept or set aside, as on paper. */
export interface RootsFound {
  readonly roots: readonly Root[];
  /** Of a quadratic, a·x² + b·x + c = 0: its coefficients as written and the discriminant b² − 4·a·c. */
  readonly quadratic?: {
    readonly a: Expr;
    readonly b: Expr;
    readonly c: Expr;
    readonly discriminant: Quantity;
    /** The values of a, b and c, for a print that works them out first when they are written as formulas. */
    readonly values: { readonly a: Quantity; readonly b: Quantity; readonly c: Quantity };
    readonly vertex: { readonly x: Quantity; readonly y: Quantity };
    /**
     * Without the term in x (a·x² + c = 0, x² + y² = r² for y): solved as on paper without the
     * discriminant, x = ±√(…); this is the root with +, as the equation gives it (√(r² − x²)).
     */
    readonly pure?: Expr;
  };
  /** The equation with the functions of the sheet written out: y(x) = 0 is a·x² + b·x + c = 0. */
  readonly expanded?: { readonly left: Expr; readonly right: Expr };
}

/**
 * Every root of one equation in one unknown, then sorted out by the domain and
 * the conditions: a quadratic by its discriminant (complex roots too), other
 * equations by their formulas, else the one root a numeric method finds.
 */
export function allRoots(statement: SolveStatement, ctx: EvalContext, evaluate: Evaluate): RootsFound {
  const name = statement.unknowns[0]!.name;
  const equation = statement.equations[0]!;
  if (statement.equations.length !== 1 || equation.relation) fail('E-SOLVE-CONDITIONS', equation.span);
  const at = equation.span;
  const num = (v: number): Expr => ({ kind: 'number', value: v, span: at });
  const bin = (operator: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({ kind: 'binary', operator, left, right, span: at });
  const sqrt = (arg: Expr): Expr => ({ kind: 'call', name: 'sqrt', args: [arg], named: [], span: at });
  const value = (expr: Expr) => asQuantity(evaluate(expr, ctx), expr.span);

  let found: Quantity[] = [];
  let quadratic: RootsFound['quadratic'];
  // y(x) == 0 with y(x) := a·x² + b·x + c: the function written out, so the equation is seen for what it is.
  const left = inlineCalls(equation.left, ctx);
  const right = inlineCalls(equation.right, ctx);
  const expanded = left !== equation.left || right !== equation.right ? { left, right } : undefined;
  const q = quadraticOf(left, right, name);
  const a = q ? value(q.a) : undefined;
  if (q && a && (a.si !== 0 || a.im)) {
    const bb = bin('^', q.b, num(2));
    const fourAC = bin('*', bin('*', num(4), q.a), q.c);
    const discriminant = value(bin('-', bb, fourAC));
    // The vertex of the parabola: V = [−b/(2·a); −D/(4·a)].
    const vertex = { x: value(bin('/', { kind: 'unary', operator: '-', operand: q.b, span: at }, bin('*', num(2), q.a))), y: value(bin('-', q.c, bin('/', bb, bin('*', num(4), q.a)))) };
    // No term in x: x² = S, x = ±√S, the root as the equation gives it.
    const pure = q.b.kind === 'number' && q.b.value === 0 && !q.b.unit ? isolate(left, right, name)?.[0] : undefined;
    quadratic = { ...q, discriminant, values: { a, b: value(q.b), c: value(q.c) }, vertex, ...(pure ? { pure } : {}) };
    const twoA = bin('*', num(2), q.a);
    const minusB: Expr = { kind: 'unary', operator: '-', operand: q.b, span: at };
    if (!discriminant.im && discriminant.si >= 0) {
      // x₁,₂ = (−b ± √D)/(2·a); a double root once.
      const root = (sign: '+' | '-') => value(bin('/', bin(sign, minusB, sqrt(bin('-', bb, fourAC))), twoA));
      found = discriminant.si === 0 ? [value(bin('/', minusB, twoA))] : [root('+'), root('-')];
    } else if (!discriminant.im) {
      // D < 0: x₁,₂ = −b/(2·a) ± j·√(−D)/(2·a).
      const re = value(bin('/', minusB, twoA));
      const im = value(bin('/', sqrt(bin('-', fourAC, bb)), twoA));
      found = [quantity(re.si, re.dim, { im: im.si, ...(re.hint ? { hint: re.hint } : {}) }), quantity(re.si, re.dim, { im: -im.si, ...(re.hint ? { hint: re.hint } : {}) })];
    }
  } else {
    const formulas = isolate(left, right, name);
    const quiet: EvalContext = { ...ctx, warnings: [], tableReads: [] };
    for (const formula of formulas ?? []) {
      let v: Value;
      try {
        v = evaluate(formula, quiet);
      } catch (err) {
        if (err instanceof CalcError) continue;
        throw err;
      }
      if (v.type !== 'quantity' || !Number.isFinite(v.si)) continue;
      const same = (r: Quantity) => Math.abs(r.si - v.si) <= 1e-12 * Math.max(Math.abs(v.si), 1e-300) && (r.im ?? 0) === ((v as Quantity).im ?? 0);
      if (found.some(same)) continue;
      if (rootHolds(equation, name, v, ctx, evaluate)) found.push(v);
    }
    // Not to be expressed by a formula: the root a numeric method finds (in the interval, from the guess).
    if (!formulas) {
      const { domain: _domain, conditions: _conditions, ...plain } = statement;
      found = solveEquations(plain, ctx, evaluate).values;
    }
  }

  // The interval is a condition too: low ≤ x ≤ high.
  const range = statement.range ? [value(statement.range.low), value(statement.range.high)].sort((p, r) => p.si - r.si) : undefined;
  const conditions = statement.conditions ?? [];
  // A unit the unknown is compared with (Ω > 0 s^-2, x in 0 m .. 5 m) is the unit of its roots, not one
  // made up from the coefficients (N/(kg·m)).
  const stated = [...(range ?? []), ...conditions.flatMap((c) => (c.kind === 'binary' ? [c.left, c.right] : [])).filter((e) => !(e.kind === 'variable' && e.name === name)).flatMap((e) => {
    try {
      const v = evaluate(e, { ...ctx, warnings: [], tableReads: [] });
      return v.type === 'quantity' ? [v] : [];
    } catch (err) {
      if (err instanceof CalcError) return [];
      throw err;
    }
  })].find((v) => v.hint && found.length > 0 && sameDim(v.dim, found[0]!.dim));
  if (stated?.hint) found = found.map((r) => (sameDim(r.dim, stated.dim) ? quantity(r.si, r.dim, { ...(r.im ? { im: r.im } : {}), ...(r.exact ? { exact: r.exact } : {}), hint: stated.hint! }) : r));
  const roots = found.map((root): Root => {
    if (root.im && statement.domain !== 'complex') return { value: root, rejected: 'complex' };
    if (!inWholeDomain(root, statement.domain)) return { value: root, rejected: 'domain' };
    if (range && (root.im || root.si < range[0]!.si || root.si > range[1]!.si)) return { value: root, rejected: conditions.length };
    const there: EvalContext = { ...ctx, warnings: [], tableReads: [], lookup: (n, span) => (n === name ? root : ctx.lookup(n, span)) };
    const failing = conditions.findIndex((condition) => {
      try {
        const v = evaluate(condition, there);
        return v.type !== 'boolean' || !v.value;
      } catch (err) {
        // A complex root cannot be compared (x > 0): it does not meet the condition.
        if (err instanceof CalcError) return true;
        throw err;
      }
    });
    return failing >= 0 ? { value: root, rejected: failing } : { value: root };
  });
  return { roots, ...(quadratic ? { quadratic } : {}), ...(expanded ? { expanded } : {}) };
}

/**
 * Whether a real root belongs to ℕ, ℕ₀ or ℤ (any other domain: yes): a plain number, whole within rounding
 * (a root from a formula may come out as 2.9999999999).
 */
function inWholeDomain(root: Quantity, domain: SolveDomain | undefined): boolean {
  if (domain !== 'natural' && domain !== 'natural0' && domain !== 'integer') return true;
  if (!isDimensionless(root.dim)) return false;
  const whole = Math.round(root.si);
  if (Math.abs(root.si - whole) > 1e-9 * Math.max(1, Math.abs(root.si))) return false;
  return domain === 'integer' || whole >= (domain === 'natural' ? 1 : 0);
}

/**
 * Calls of functions of the sheet written out into their formulas (y(x) becomes
 * a·x² + b·x + c), a few levels deep; the same expression when there is none.
 */
export function inlineCalls(expr: Expr, ctx: EvalContext, depth = 0): Expr {
  const again = (e: Expr) => inlineCalls(e, ctx, depth);
  switch (expr.kind) {
    case 'call': {
      const args = expr.args.map(again);
      let own: Value | undefined;
      try {
        own = depth < 8 ? ctx.lookup(expr.name, expr.span) : undefined;
      } catch (err) {
        if (!(err instanceof CalcError)) throw err;
      }
      if (own?.type === 'function' && !own.native && !own.fit && own.params.length === args.length && expr.named.length === 0) {
        return inlineCalls(substitute(own.body, new Map(own.params.map((p, i) => [p, args[i]!]))), ctx, depth + 1);
      }
      return args.every((a, i) => a === expr.args[i]) ? expr : { ...expr, args };
    }
    case 'prime': {
      // y′(x) of a function of the sheet: its derivative written out by hand (2·a·x + b), when it can be.
      if (!expr.arg || depth >= 8) return expr;
      let own: Value | undefined;
      try {
        own = ctx.lookup(expr.name, expr.span);
      } catch (err) {
        if (!(err instanceof CalcError)) throw err;
      }
      if (own?.type !== 'function' || own.native || own.fit || own.derivative || own.params.length !== 1) return expr;
      let body: Expr | undefined = inlineCalls(own.body, ctx, depth + 1);
      for (let k = 0; k < expr.order && body; k++) body = differentiate(body, own.params[0]!);
      return body ? inlineCalls(substitute(body, new Map([[own.params[0]!, again(expr.arg)]])), ctx, depth + 1) : expr;
    }
    case 'unary': {
      const operand = again(expr.operand);
      return operand === expr.operand ? expr : { ...expr, operand };
    }
    case 'binary': {
      const l = again(expr.left);
      const r = again(expr.right);
      return l === expr.left && r === expr.right ? expr : { ...expr, left: l, right: r };
    }
    default:
      return expr;
  }
}

/**
 * Newton from the first guess; where it does not converge and some unknowns had
 * no guess of their own, again from other starting values of those (other
 * sizes and signs, a little different for each), as a person would try. The
 * first failure is reported.
 */
function withMoreStarts(start: number[], guessed: readonly boolean[], solve: (start: number[]) => number[]): number[] {
  try {
    return solve(start);
  } catch (first) {
    if (!(first instanceof CalcError) || guessed.every(Boolean) || !['E-SOLVE-NO-CONVERGENCE', 'E-SOLVE-SINGULAR'].includes(first.diagnostic.code)) throw first;
    for (const factor of [-1, 10, -10, 0.1, -0.1, 100, -100, 0.01, 1000, -1000]) {
      try {
        // Each unknown a little different: equal starting values often keep the Jacobian singular.
        return solve(start.map((v, i) => (guessed[i] ? v : v * factor * (1 + 0.31 * i))));
      } catch (err) {
        if (!(err instanceof CalcError)) throw err;
      }
    }
    throw first;
  }
}

/** One unknown in [a, b]: regula falsi with the Anderson–Björck correction. */
function bracketed(low: number, high: number, g: (x: number) => { r: number[]; scale: number[] }, span: Span): number {
  const f = (x: number): number => {
    try {
      return g(x).r[0]!;
    } catch (err) {
      // A point where the equation cannot be evaluated gives no sign information.
      if (err instanceof CalcError && UNDEFINED_POINT.has(err.diagnostic.code)) return Number.NaN;
      throw err;
    }
  };
  const done = (x: number): boolean => {
    const { r, scale } = g(x);
    return Math.abs(r[0]!) <= RESIDUAL_TOLERANCE * scale[0]!;
  };

  let a = low;
  let b = high;
  let fa = f(a);
  let fb = f(b);
  if (fa === 0 && done(a)) return a;
  if (fb === 0 && done(b)) return b;

  // No sign change at the ends: look for one inside (e.g. two roots in the interval).
  if (!(fa * fb < 0)) {
    const step = (high - low) / SCAN_STEPS;
    let found = false;
    let x0 = low;
    let f0 = fa;
    for (let i = 1; i <= SCAN_STEPS && !found; i++) {
      const x1 = low + step * i;
      const f1 = f(x1);
      if (f1 === 0) return x1;
      if (f0 * f1 < 0) {
        [a, fa, b, fb] = [x0, f0, x1, f1];
        found = true;
      }
      if (!Number.isNaN(f1)) [x0, f0] = [x1, f1];
    }
    if (!found) fail('E-SOLVE-NO-ROOT', span);
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const c = b - (fb * (b - a)) / (fb - fa);
    const fc = f(c);
    if (fc === 0 || Math.abs(b - a) <= 4 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b))) return c;
    if (fc * fb < 0) {
      a = b;
      fa = fb;
    } else {
      const m = 1 - fc / fb;
      fa *= m > 0 ? m : 0.5;
    }
    b = c;
    fb = fc;
    if (done(c)) return c;
  }
  return b;
}

/** A system (or one unknown without an interval): damped Newton–Raphson. */
function newton(start: number[], residuals: (x: readonly number[]) => { r: number[]; scale: number[] }, span: Span): number[] {
  let x = [...start];
  const typical = start.map((v) => Math.abs(v) || 1);
  let current = residuals(x);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (converged(current)) return x;
    const n = x.length;
    const jacobian: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(Math.abs(x[j]!), typical[j]!);
      const shifted = [...x];
      shifted[j] = x[j]! + h;
      const r = residuals(shifted).r;
      for (let i = 0; i < n; i++) (jacobian[i] ??= [])[j] = (r[i]! - current.r[i]!) / h;
    }
    const step = gauss(jacobian, current.r.map((v) => -v));
    if (!step) fail('E-SOLVE-SINGULAR', span);

    // Damped step: halve until the residuals get smaller.
    let accepted = false;
    for (let t = 1; t >= 1 / 1024; t /= 2) {
      const next = x.map((v, i) => v + t * step[i]!);
      let trial: { r: number[]; scale: number[] };
      try {
        trial = residuals(next);
      } catch (err) {
        if (err instanceof CalcError && err.diagnostic.code !== 'E-UNIT-MISMATCH') continue;
        throw err;
      }
      if (size(trial) < size(current)) {
        x = next;
        current = trial;
        accepted = true;
        break;
      }
    }
    if (!accepted) break;
  }
  if (converged(current)) return x;
  return fail('E-SOLVE-NO-CONVERGENCE', span);
}

/** The terms of a sum or difference ("δ_10 + δ_11·X_1" → δ_10, δ_11·X_1); one term otherwise. */
function termsOf(e: Expr): Expr[] {
  if (e.kind === 'binary' && (e.operator === '+' || e.operator === '-')) return [...termsOf(e.left), ...termsOf(e.right)];
  if (e.kind === 'unary' && (e.operator === '-' || e.operator === '+')) return termsOf(e.operand);
  return [e];
}

function converged({ r, scale }: { r: number[]; scale: number[] }): boolean {
  return r.every((v, i) => Math.abs(v) <= RESIDUAL_TOLERANCE * scale[i]!);
}

function size({ r, scale }: { r: number[]; scale: number[] }): number {
  return Math.hypot(...r.map((v, i) => v / scale[i]!));
}

/** Solves A·x = b with partial pivoting; undefined when A is singular. */
function gauss(a: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    const largest = Math.max(...m.map((row) => Math.abs(row[col]!)));
    if (Math.abs(m[pivot]![col]!) <= 1e-13 * (largest || 1) || m[pivot]![col] === 0) return undefined;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}
