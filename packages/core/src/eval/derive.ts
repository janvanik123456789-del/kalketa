/**
 * Derivations (docs/03-jazyk.md, ch. 9.1): a == b == c, alone (derive) or
 * ending in a definition (y := a == b == c).
 *
 * Every step is checked to hold in general, not only for the numbers of the
 * sheet: each name takes random values at a few points (keeping its dimension
 * where the sheet defines it), and both sides must agree there in value and in
 * dimension. A step that holds for one number only does not pass, except
 * where numbers are put in (a side without names): that step holds for the
 * values of the sheet. A name the
 * sheet calculates from others (M := q·L²/8) stands for its formula, so only
 * the given values vary and M keeps its relation to q and L.
 *
 * What has no value to try (Σ and ∫ without bounds, functions nobody defined)
 * is one opaque part: the same part on both sides gets the same value.
 */

import { diagnostic, type Diagnostic, type Span } from '../diagnostics.js';
import type { Expr } from '../lang/ast.js';
import { DIMENSIONLESS, sameDim, type Dimension } from '../units/dimension.js';
import { baseUnitSymbol } from '../units/display.js';
import { quantity, type Quantity, type Value } from '../values/value.js';
import type { EvalContext } from './evaluator.js';
import { FUNCTION_NAMES } from './functions.js';
import { TABLE_FUNCTIONS } from './tables.js';

type Evaluate = (expr: Expr, ctx: EvalContext) => Value;

export type StepProblem = 'differs' | 'units' | 'unverified';

/** Step i joins member i and member i + 1. */
export interface DerivationStep {
  readonly ok: boolean;
  readonly problem?: StepProblem;
}

/** Points at which the members are compared. */
const SAMPLES = 5;
/** Relative difference still taken as equal (rounding of different but equal forms). */
const TOLERANCE = 1e-9;
/** Name of an opaque part in the rewritten members. */
const ATOM = '\u0000part:';

/** Σ and ∫ without bounds: sum(F_i·a_i, i), integral(y^2, dS). A notation, not a value. */
export function isUnboundedCall(expr: Expr): boolean {
  return expr.kind === 'call' && expr.named.length === 0 && expr.args.length === 2 && (expr.name === 'integral' || expr.name === 'sum');
}

/**
 * @param formulaOf the formula of a name the sheet calculated above (M := q·L²/8);
 *   undefined for given values, symbols and anything else.
 * @param params parameters of a function being derived (dV(z) := … == …): they vary like
 *   symbols, in the dimension that makes every member a value (z in h − z: a length).
 */
export function checkDerivation(
  members: readonly Expr[],
  ctx: EvalContext,
  evaluate: Evaluate,
  formulaOf: (name: string) => Expr | undefined = () => undefined,
  params: readonly string[] = [],
): { steps: DerivationStep[]; diagnostics: Diagnostic[] } {
  const atoms: Expr[] = [];
  const keys = new Map<string, number>();
  // Parameters are names of the members only: the sheet's values of the same names do not count.
  const own = params.length > 0 ? { ...ctx, lookup: (name: string, span: Span) => (params.includes(name) ? quantity(1) : ctx.lookup(name, span)) } : ctx;
  const rewritten = members.map((m) => opaqueParts(m, own, evaluate, atoms, keys));
  const formulas = new Map<string, Expr | undefined>();
  const formula = (name: string): Expr | undefined => {
    if (!formulas.has(name)) {
      const own = formulaOf(name);
      formulas.set(name, own && usesNames(own) ? opaqueParts(own, ctx, evaluate, atoms, keys) : undefined);
    }
    return formulas.get(name);
  };

  let paramDims: readonly Dimension[] = params.map(() => DIMENSIONLESS);
  const sample = (point: number): (Quantity | undefined)[] => {
    const known = new Map<string, Value>();
    const lookup = (name: string, span: Span): Value => {
      const done = known.get(name);
      if (done) return done;
      let value: Value;
      const param = params.indexOf(name);
      if (param >= 0) {
        value = quantity(randomFactor(name, point), paramDims[param]);
      } else if (name.startsWith(ATOM)) {
        const index = Number(name.slice(ATOM.length));
        value = scaled(tryValue(() => evaluate(atoms[index]!, ctx)), name, point);
      } else {
        const own = formula(name);
        const calculated = own ? tryValue(() => evaluate(own, at)) : undefined;
        value = calculated ?? scaled(tryValue(() => ctx.lookup(name, span)), name, point);
      }
      known.set(name, value);
      return value;
    };
    const at: EvalContext = { ...ctx, warnings: [], lookup };
    return rewritten.map((m) => {
      const value = tryValue(() => evaluate(m, at));
      return value?.type === 'quantity' ? value : undefined;
    });
  };
  if (params.length > 0) paramDims = dimensionsOfParams(params, members, ctx, (dims) => {
    paramDims = dims;
    return sample(0).every(Boolean);
  });
  const points = Array.from({ length: SAMPLES }, (_, i) => sample(i));
  // Numbers put in ("= 12·5²/8 = 37,5") hold for the values of the sheet only: such a step is checked with them.
  const actual = members.map((m) => {
    const value = tryValue(() => evaluate(m, { ...ctx, warnings: [] }));
    return value?.type === 'quantity' ? value : undefined;
  });

  const steps: DerivationStep[] = [];
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i + 1 < members.length; i++) {
    const span = between(members[i]!.span, members[i + 1]!.span);
    let compared = 0;
    let problem: StepProblem | undefined;
    const numbers = !usesNames(members[i]!) || !usesNames(members[i + 1]!);
    for (const values of numbers ? [actual] : points) {
      const [a, b] = [values[i], values[i + 1]];
      if (!a || !b) continue;
      compared++;
      if (!sameDim(a.dim, b.dim)) {
        problem = 'units';
        diagnostics.push(diagnostic('E-DERIVE-UNITS', span, { step: i + 1, left: baseUnitSymbol(a.dim), right: baseUnitSymbol(b.dim) }));
        break;
      }
      if (!equal(a, b)) {
        problem = 'differs';
        diagnostics.push(diagnostic('E-DERIVE-STEP', span, { step: i + 1 }));
        break;
      }
    }
    if (!problem && compared === 0) {
      problem = 'unverified';
      diagnostics.push(diagnostic('W-DERIVE-UNVERIFIED', span, { step: i + 1 }));
    }
    steps.push(problem ? { ok: false, problem } : { ok: true });
  }
  return { steps, diagnostics };
}

/**
 * The member with what has no value to try replaced by names of opaque parts:
 * Σ and ∫ without bounds, members of tables and records, functions the sheet
 * does not know. Equal parts (by their notation) share one name.
 */
function opaqueParts(expr: Expr, ctx: EvalContext, evaluate: Evaluate, atoms: Expr[], keys: Map<string, number>, depth = 0): Expr {
  const part = (key: string, of: Expr): Expr => {
    let index = keys.get(key);
    if (index === undefined) {
      index = atoms.push(of) - 1;
      keys.set(key, index);
    }
    return { kind: 'variable', name: `${ATOM}${index}`, span: of.span };
  };
  const inner = (e: Expr) => opaqueParts(e, ctx, evaluate, atoms, keys, depth);
  // A function of the sheet (ε_xx(z) := -p_v(z)/E) stands for its formula: written out, the names
  // it reads vary with the others, so ε_xx(z) and -ρ·g·(h - z)/E are found equal. A fitted
  // curve keeps its own coefficients; a function calling itself is written out a few times only.
  const own = expr.kind === 'call' && depth < MAX_INLINE ? tryValue(() => ctx.lookup(expr.name, expr.span)) : undefined;
  if (expr.kind === 'call' && own?.type === 'function' && !own.fit && own.params.length === expr.args.length && expr.named.length === 0) {
    const args = new Map(own.params.map((p, i) => [p, expr.args[i]!] as const));
    return opaqueParts(substitute(own.body, args), ctx, evaluate, atoms, keys, depth + 1);
  }
  // Σ and ∫ without bounds are linear: the body times a factor of their own for each dS or i,
  // so Σ a·b = Σ b·a and E·∫f dS = ∫E·f dS hold, ∫f·g dS = ∫f dS·∫g dS does not.
  const symbolicSum = expr.kind === 'call' && expr.name === 'sum' && expr.args.length === 1 && expr.named.length === 0 && tryValue(() => evaluate(expr, ctx)) === undefined;
  if (expr.kind === 'call' && (isUnboundedCall(expr) || symbolicSum)) {
    const by = expr.args[1];
    const factor = part(`${expr.name}:${by ? notation(by) : ''}`, by ?? expr);
    return { kind: 'binary', operator: '*', left: inner(expr.args[0]!), right: factor, span: expr.span };
  }
  const opaque =
    expr.kind === 'member' ||
    (expr.kind === 'call' && !FUNCTION_NAMES.includes(expr.name) && !TABLE_FUNCTIONS.has(expr.name) && !['integral', 'derivative', 'sum'].includes(expr.name) && !isKnown(expr.name, expr.span, ctx));
  if (opaque) return part(notation(expr), expr);
  switch (expr.kind) {
    case 'unary':
      return { ...expr, operand: inner(expr.operand) };
    case 'binary':
      return { ...expr, left: inner(expr.left), right: inner(expr.right) };
    case 'call':
      return { ...expr, args: expr.args.map(inner), named: expr.named.map((n) => ({ ...n, value: inner(n.value) })) };
    case 'vector':
      return { ...expr, items: expr.items.map(inner) };
    case 'index':
      return { ...expr, object: inner(expr.object), index: inner(expr.index), ...(expr.column ? { column: inner(expr.column) } : {}) };
    default:
      return expr;
  }
}

/**
 * The dimensions of the parameters with which every member has a value: tried from the
 * dimensions of the names the members read, and none (a pure number), in turn.
 */
function dimensionsOfParams(params: readonly string[], members: readonly Expr[], ctx: EvalContext, works: (dims: readonly Dimension[]) => boolean): readonly Dimension[] {
  const names = new Set<string>();
  const walk = (e: Expr): void => {
    if (e.kind === 'variable') names.add(e.name);
    else if (e.kind === 'unary') walk(e.operand);
    else if (e.kind === 'binary') (walk(e.left), walk(e.right));
    else if (e.kind === 'call') (e.args.forEach(walk), e.named.forEach((n) => walk(n.value)));
  };
  members.forEach(walk);
  const candidates: Dimension[] = [DIMENSIONLESS];
  for (const name of names) {
    if (params.includes(name)) continue;
    const value = tryValue(() => ctx.lookup(name, members[0]!.span));
    if (value?.type === 'quantity' && !candidates.some((d) => sameDim(d, value.dim))) candidates.push(value.dim);
  }
  // Every combination, the first that works; a few parameters only, so few tries.
  let tries = 0;
  const pick = (i: number, chosen: Dimension[]): readonly Dimension[] | undefined => {
    if (i === params.length) return ++tries <= 200 && works(chosen) ? chosen : undefined;
    for (const d of candidates) {
      const found = pick(i + 1, [...chosen, d]);
      if (found) return found;
    }
    return undefined;
  };
  return pick(0, []) ?? params.map(() => DIMENSIONLESS);
}

/** How deep functions of the sheet are written out into their formulas. */
const MAX_INLINE = 8;

/** The body of a function with its parameters replaced by the arguments of the call. */
function substitute(expr: Expr, args: ReadonlyMap<string, Expr>): Expr {
  const s = (e: Expr) => substitute(e, args);
  switch (expr.kind) {
    case 'variable':
      return args.get(expr.name) ?? expr;
    case 'unary':
      return { ...expr, operand: s(expr.operand) };
    case 'binary':
      return { ...expr, left: s(expr.left), right: s(expr.right) };
    case 'call':
      return { ...expr, args: expr.args.map(s), named: expr.named.map((n) => ({ ...n, value: s(n.value) })) };
    case 'vector':
      return { ...expr, items: expr.items.map(s) };
    case 'index':
      return { ...expr, object: s(expr.object), index: s(expr.index), ...(expr.column ? { column: s(expr.column) } : {}) };
    default:
      return expr;
  }
}

/** Whether a formula reads names (else it is a given value, which varies on its own). */
function usesNames(expr: Expr): boolean {
  switch (expr.kind) {
    case 'variable':
    case 'member':
    case 'call':
      return true;
    case 'unary':
      return usesNames(expr.operand);
    case 'binary':
      return usesNames(expr.left) || usesNames(expr.right);
    case 'vector':
      return expr.items.some(usesNames);
    case 'matrix':
      return expr.rows.some((r) => r.some(usesNames));
    case 'index':
      return usesNames(expr.object) || usesNames(expr.index);
    default:
      return false;
  }
}

/** A function of the sheet (A(d) := …) or a block: callable, so not opaque. */
function isKnown(name: string, span: Span, ctx: EvalContext): boolean {
  if (ctx.blocks?.has(name)) return true;
  const value = tryValue(() => ctx.lookup(name, span));
  return value?.type === 'function';
}

/** The notation of an expression, without positions: equal parts written alike match. */
function notation(expr: Expr): string {
  return JSON.stringify(expr, (key, value: unknown) => (key === 'span' || key === 'nameSpan' ? undefined : value));
}

function tryValue(f: () => Value): Value | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

/**
 * The value a name takes at one point: its own value (unit and all) times a
 * random factor, or a random plain number when it has none (a symbol of theory).
 */
function scaled(real: Value | undefined, name: string, point: number): Value {
  const factor = randomFactor(name, point);
  if (!real) return quantity(factor);
  if (real.type === 'quantity') return { ...real, si: real.si * factor, ...(real.im ? { im: real.im * factor } : {}) };
  if (real.type === 'vector') return { ...real, items: real.items.map((q) => ({ ...q, si: q.si * factor })) };
  return real;
}

/** 0.6 … 1.9, the same for a name and a point every time (no whole numbers that hide mistakes). */
function randomFactor(name: string, point: number): number {
  let h = 2166136261 ^ point;
  for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  const unit = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return 0.6 + 1.3 * unit;
}

function equal(a: Quantity, b: Quantity): boolean {
  const size = Math.max(Math.hypot(a.si, a.im ?? 0), Math.hypot(b.si, b.im ?? 0));
  return Math.hypot(a.si - b.si, (a.im ?? 0) - (b.im ?? 0)) <= TOLERANCE * size;
}

function between(a: Span, b: Span): Span {
  return { offset: a.offset, length: b.offset + b.length - a.offset, line: a.line, column: a.column };
}
