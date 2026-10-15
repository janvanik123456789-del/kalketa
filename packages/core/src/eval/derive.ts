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
 *
 * Below a relation (relation dV − dV_0 == (2·ε_xx + ε_zz)·dV_0) a step that is
 * no identity may follow from it: it is tried again at points where the
 * relation holds, one of its names calculated from the others there.
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
  /** The step holds where the relation does, not in general: its name ({eq=3}) or its line. */
  readonly relation?: { readonly label?: string; readonly line: number };
}

/** A relation of the sheet above a derivation: an equation that holds (left == right). */
export interface SheetRelation {
  readonly expr: Expr;
  readonly label?: string;
  readonly line: number;
}

/** Points at which the members are compared. */
const SAMPLES = 5;
/** A step equal when rounded (≐, 5,473 ≐ 5,5): as far apart as a result rounded to two digits. */
const ROUNDED = 0.01;
/** How small the symbols of theory are for a ≐ step that holds for small values only (γ ≐ tg γ). */
const SMALL = 1e-3;
/** Relative difference still taken as equal (rounding of different but equal forms). */
const TOLERANCE = 1e-9;
/** The same where a name was calculated from a relation first (to some 12 digits). */
const RELATED = 1e-7;
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
  approx: readonly number[] = [],
  relations: readonly SheetRelation[] = [],
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

  // The symbols of theory met (no value in the sheet): a ≐ step may hold when they, or one of them, get small.
  const symbols = new Set<string>();
  // The relations as the members are: their sides with the same opaque parts.
  // Only those that share a name with the members, and whose names are values or symbols here: a name the
  // sheet has made a function since (ε_xx(z) := … below relation dV − dV₀ = (2·ε_xx + ε_zz)·dV₀) is not that symbol.
  const memberNames = new Set(members.flatMap((m) => [...namesIn(m)]));
  const holding = relations.flatMap((r) => {
    if (r.expr.kind !== 'binary') return [];
    const names = namesIn(r.expr);
    if (![...names].some((n) => memberNames.has(n))) return [];
    if ([...names].some((n) => { const v = tryValue(() => ctx.lookup(n, r.expr.span)); return v !== undefined && v.type !== 'quantity'; })) return [];
    return [{ relation: r, left: opaqueParts(r.expr.left, own, evaluate, atoms, keys), right: opaqueParts(r.expr.right, own, evaluate, atoms, keys), names }];
  });
  type Holding = (typeof holding)[number];
  // Symbols of a relation vary like parameters, in the dimension the relation gives them (x, y of x² + y² = r² with r in m: lengths).
  const loose = [...new Set(holding.flatMap((h) => [...h.names]))].filter((n) => !params.includes(n) && !formula(n) && !tryValue(() => ctx.lookup(n, members[0]!.span)));
  const varying = [...params, ...loose];
  let paramDims: readonly Dimension[] = varying.map(() => DIMENSIONLESS);
  // small: how small a symbol of theory or a parameter is taken (1 = as usual). under: relations made to hold at the point.
  // sides: the sides of the relations after the members (are they of one dimension?).
  const sample = (point: number, small: (name: string) => number = () => 1, under: readonly Holding[] = [], prefer: ReadonlySet<string> = new Set(), sides = false): (Quantity | undefined)[] => {
    const known = new Map<string, Value>();
    const calculated = new Set<string>();
    const lookup = (name: string, span: Span): Value => {
      const done = known.get(name);
      if (done) return done;
      let value: Value;
      const param = varying.indexOf(name);
      if (param >= 0) {
        symbols.add(name);
        value = quantity(randomFactor(name, point) * small(name), paramDims[param]);
      } else if (name.startsWith(ATOM)) {
        const index = Number(name.slice(ATOM.length));
        value = scaled(tryValue(() => evaluate(atoms[index]!, ctx)), name, point);
      } else {
        const own = formula(name);
        const fromFormula = own ? tryValue(() => evaluate(own, at)) : undefined;
        const real = fromFormula ? undefined : tryValue(() => ctx.lookup(name, span));
        if (!fromFormula && !real) symbols.add(name);
        if (fromFormula) calculated.add(name);
        value = fromFormula ?? scaled(real, name, point, small(name));
      }
      known.set(name, value);
      return value;
    };
    const at: EvalContext = { ...ctx, warnings: [], lookup };
    // Each relation made to hold: one of its names (one of the step first) calculated from the others.
    const solveFor = (h: Holding, name: string): boolean => {
      const start = tryValue(() => lookup(name, h.relation.expr.span));
      if (start?.type !== 'quantity' || start.im) return false;
      const gap = (si: number): number | undefined => {
        known.set(name, { ...start, si });
        for (const c of calculated) known.delete(c);
        calculated.clear();
        const [l, r] = [tryValue(() => evaluate(h.left, at)), tryValue(() => evaluate(h.right, at))];
        if (l?.type !== 'quantity' || r?.type !== 'quantity' || l.im || r.im || !sameDim(l.dim, r.dim)) return undefined;
        const scale = Math.max(Math.abs(l.si), Math.abs(r.si), Number.MIN_VALUE);
        return (l.si - r.si) / scale;
      };
      const root = secant(gap, start.si);
      if (root === undefined) {
        known.set(name, start);
        return false;
      }
      gap(root);
      return true;
    };
    const chosen: [Holding, string][] = [];
    for (const h of under) {
      const taken = new Set(chosen.map(([, n]) => n));
      const candidates = [...h.names].filter((n) => !taken.has(n) && !formula(n)).sort((a, b) => Number(prefer.has(b)) - Number(prefer.has(a)));
      const done = candidates.find((name) => solveFor(h, name));
      if (done === undefined) return rewritten.map(() => undefined);
      chosen.push([h, done]);
    }
    // A later relation may move a name an earlier one was solved with (ε_yy = ε_xx after dV − dV₀ = (ε_xx + ε_yy + ε_zz)·dV₀):
    // solved again in turn until they all hold together.
    const holds = ([h]: [Holding, string]) => {
      const [l, r] = [tryValue(() => evaluate(h.left, at)), tryValue(() => evaluate(h.right, at))];
      return l?.type === 'quantity' && r?.type === 'quantity' && equal(l, r, RELATED * 1e-3);
    };
    for (let round = 0; round < 30 && !chosen.every(holds); round++) {
      for (const [h, name] of chosen) if (!solveFor(h, name)) return rewritten.map(() => undefined);
    }
    return (sides ? [...rewritten, ...holding.flatMap((h) => [h.left, h.right])] : rewritten).map((m) => {
      const value = tryValue(() => evaluate(m, at));
      return value?.type === 'quantity' ? value : undefined;
    });
  };
  if (varying.length > 0) {
    paramDims = dimensionsOfParams(varying, [...members, ...holding.map((h) => h.relation.expr)], ctx, (dims) => {
      paramDims = dims;
      const values = sample(0, () => 1, [], new Set(), true);
      const relationsAgree = holding.every((_, k) => {
        const [l, r] = [values[members.length + 2 * k], values[members.length + 2 * k + 1]];
        return !!l && !!r && sameDim(l.dim, r.dim);
      });
      return relationsAgree && (params.length === 0 || values.slice(0, members.length).every(Boolean));
    });
  }
  const points = Array.from({ length: SAMPLES }, (_, i) => sample(i));
  // All the symbols small (γ ≐ tg γ), or one of them (Δl ≪ l in atan(Δl/l) ≐ Δl/l).
  let smallPoints: (Quantity | undefined)[][][] | undefined;
  const smallVariants = () => {
    const at = (small: (name: string) => number) => Array.from({ length: SAMPLES }, (_, p) => sample(p, small));
    return [at(() => SMALL), ...[...symbols].map((one) => at((name) => (name === one ? SMALL : 1)))];
  };
  // Numbers put in ("= 12·5²/8 = 37,5") hold for the values of the sheet only: such a step is checked with them.
  const actual = members.map((m) => {
    const value = tryValue(() => evaluate(m, { ...ctx, warnings: [] }));
    return value?.type === 'quantity' ? value : undefined;
  });

  // A step that is no identity, tried where the relations above hold that share names with it.
  const followsFrom = (i: number): DerivationStep['relation'] | undefined => {
    const names = new Set([...namesIn(members[i]!), ...namesIn(members[i + 1]!)]);
    const under = holding.filter((h) => [...h.names].some((n) => names.has(n)));
    if (under.length === 0) return undefined;
    let compared = 0;
    for (let point = 0; point < SAMPLES; point++) {
      const values = sample(point, () => 1, under, names);
      const [a, b] = [values[i], values[i + 1]];
      if (!a || !b) continue;
      compared++;
      if (!sameDim(a.dim, b.dim) || !equal(a, b, approx.includes(i) ? ROUNDED : RELATED)) return undefined;
    }
    if (compared < 3) return undefined;
    const last = under[under.length - 1]!.relation;
    return { ...(last.label !== undefined ? { label: last.label } : {}), line: last.line };
  };

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
      if (!equal(a, b, approx.includes(i) ? ROUNDED : TOLERANCE)) {
        // An approximation of theory for small values: it holds as the symbols get small.
        if (approx.includes(i) && !numbers) {
          smallPoints ??= smallVariants();
          if (smallPoints.some((variant) => variant.every((v) => !v[i] || !v[i + 1] || equal(v[i]!, v[i + 1]!, ROUNDED)))) break;
        }
        problem = 'differs';
        break;
      }
    }
    if (problem === 'differs') {
      const relation = numbers ? undefined : followsFrom(i);
      if (relation) {
        steps.push({ ok: true, relation });
        continue;
      }
      diagnostics.push(diagnostic('E-DERIVE-STEP', span, { step: i + 1 }));
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
export function substitute(expr: Expr, args: ReadonlyMap<string, Expr>): Expr {
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
function scaled(real: Value | undefined, name: string, point: number, small = 1): Value {
  const factor = randomFactor(name, point);
  if (!real) return quantity(factor * small);
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

function equal(a: Quantity, b: Quantity, tolerance = TOLERANCE): boolean {
  const size = Math.max(Math.hypot(a.si, a.im ?? 0), Math.hypot(b.si, b.im ?? 0));
  return Math.hypot(a.si - b.si, (a.im ?? 0) - (b.im ?? 0)) <= tolerance * size;
}

function between(a: Span, b: Span): Span {
  return { offset: a.offset, length: b.offset + b.length - a.offset, line: a.line, column: a.column };
}

/** The names an expression reads (not the variables of its own integrals or sums, which it binds). */
function namesIn(expr: Expr): Set<string> {
  const out = new Set<string>();
  const walk = (e: Expr, bound: ReadonlySet<string>) => {
    switch (e.kind) {
      case 'variable':
        if (!bound.has(e.name)) out.add(e.name);
        return;
      case 'unary':
        return walk(e.operand, bound);
      case 'binary':
        walk(e.left, bound);
        return walk(e.right, bound);
      case 'call': {
        const inner = new Set([...bound, ...e.named.filter((n) => n.value.kind === 'range').map((n) => n.name)]);
        e.args.forEach((a) => walk(a, inner));
        e.named.forEach((n) => walk(n.value, bound));
        return;
      }
      default:
        for (const value of Object.values(e)) {
          if (value && typeof value === 'object' && 'kind' in value && 'span' in value) walk(value as Expr, bound);
          if (Array.isArray(value)) for (const item of value) if (item && typeof item === 'object' && 'kind' in item && 'span' in item) walk(item as Expr, bound);
        }
    }
  };
  walk(expr, new Set());
  return out;
}

/** Where f is zero near x0: the secant method, from x0 and a point beside it; undefined when it does not settle. */
function secant(f: (x: number) => number | undefined, x0: number): number | undefined {
  for (const start of [x0, -x0, 2 * x0 + 1, 0.5 * x0 - 1]) {
    let a = start;
    let b = start === 0 ? 1e-3 : start * (1 + 1e-3);
    let fa = f(a);
    let fb = f(b);
    for (let k = 0; k < 60 && fa !== undefined && fb !== undefined; k++) {
      if (Math.abs(fb) <= 1e-13) return b;
      if (fb === fa) break;
      const next = b - (fb * (b - a)) / (fb - fa);
      if (!Number.isFinite(next)) break;
      [a, fa] = [b, fb];
      b = next;
      fb = f(b);
    }
  }
  return undefined;
}
