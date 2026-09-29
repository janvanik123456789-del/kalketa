/**
 * Sheet evaluation with incremental recalculation.
 *
 * A sheet is read top to bottom: a name must be defined above its first use
 * and may be defined only once, so there are no cycles. The dependency graph
 * is recorded per statement; when the source changes, a statement is
 * re-evaluated only if its own text or the value of one of its dependencies
 * changed.
 */

import { CalcError, diagnostic, type Diagnostic, type Span } from '../diagnostics.js';
import { asBoolean, asQuantity } from '../eval/coerce.js';
import { compare, evaluate, type EvalContext } from '../eval/evaluator.js';
import { BUILTIN_CONSTANTS } from '../eval/functions.js';
import type { BinaryOperator, Sheet, Statement } from '../lang/ast.js';
import { parse } from '../lang/parser.js';
import type { Table, TableRead } from '../tables/table.js';
import { sameDim } from '../units/dimension.js';
import { baseUnitSymbol, toDisplay, type DisplayValue } from '../units/display.js';
import { defaultRegistry, type UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import { fingerprint, type Quantity, type Value } from '../values/value.js';

export type StatementStatus = 'ok' | 'error' | 'blocked' | 'none';

/** Outcome of a `check` statement (docs/01-filozofie.md, ch. 6.1). */
export interface CheckResult {
  readonly label?: string;
  readonly source?: string;
  readonly passed: boolean;
  /**
   * Left side / right side for ≤ and <, right / left for ≥ and >.
   * Absent when the condition is not a single comparison of positive values.
   */
  readonly utilization?: number;
  readonly operator?: BinaryOperator;
  readonly left?: Quantity;
  readonly right?: Quantity;
}

export interface StatementResult {
  readonly statement: Statement;
  /** 'blocked' means a dependency failed; the root cause is reported there. */
  readonly status: StatementStatus;
  readonly value?: Value;
  readonly display?: DisplayValue;
  readonly check?: CheckResult;
  /** Names this statement read, in order of first use (including undefined ones). */
  readonly dependencies: readonly string[];
  /** Table data this statement read directly. */
  readonly tableReads: readonly TableRead[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface CheckSummaryItem extends CheckResult {
  /** Index into SheetResult.statements. */
  readonly statement: number;
}

export interface SheetResult {
  /** The evaluated source text. */
  readonly source: string;
  readonly sheet: Sheet;
  readonly statements: readonly StatementResult[];
  readonly values: ReadonlyMap<string, Value>;
  /** Tables available to the sheet, by name. */
  readonly tables: ReadonlyMap<string, Table>;
  readonly diagnostics: readonly Diagnostic[];
  /** All checks in sheet order; failed or not evaluated ones included. */
  readonly checks: readonly CheckSummaryItem[];
  /** How many statements were evaluated vs. taken from the cache. */
  readonly stats: { readonly evaluated: number; readonly reused: number };
}

export interface SessionOptions {
  readonly registry?: UnitRegistry;
}

export interface UpdateOptions {
  /** Tables of the sheet's data layer, available by name. */
  readonly tables?: readonly Table[];
}

type EnvEntry = { readonly ok: true; readonly value: Value } | { readonly ok: false };
type Evaluable = Extract<Statement, { kind: 'definition' | 'display' | 'check' }>;
type PartialResult = Omit<StatementResult, 'statement'>;

interface CacheEntry {
  readonly deps: readonly (readonly [string, string])[];
  readonly result: PartialResult;
}

const CHECK_OPERATORS: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

class DependencyFailed extends Error {}

export class SheetSession {
  private readonly registry: UnitRegistry;
  private cache = new Map<string, CacheEntry>();

  constructor(options: SessionOptions = {}) {
    this.registry = options.registry ?? defaultRegistry;
  }

  update(source: string, options: UpdateOptions = {}): SheetResult {
    const registry = this.registry;
    const tables = new Map((options.tables ?? []).map((t) => [t.name, t] as const));
    const parsed = parse(source, { isUnit: (name) => registry.isUnit(name), predefined: tables.keys() });
    const statements = parsed.sheet.statements;

    const definedAt = new Map<string, number>();
    statements.forEach((s, i) => {
      const name = s.kind === 'definition' || s.kind === 'invalid' ? s.name : undefined;
      if (name !== undefined && !definedAt.has(name)) definedAt.set(name, i);
    });

    const env = new Map<string, EnvEntry>();
    const results: StatementResult[] = [];
    const nextCache = new Map<string, CacheEntry>();
    let evaluated = 0;
    let reused = 0;
    const none = { dependencies: [], tableReads: [] } as const;

    statements.forEach((statement, index) => {
      const parseDiagnostics = parsed.diagnostics.filter((d) => within(d.span, statement.span));

      if (statement.kind === 'invalid') {
        if (statement.name !== undefined && !env.has(statement.name)) env.set(statement.name, { ok: false });
        results.push({ statement, status: 'error', ...none, diagnostics: parseDiagnostics });
        return;
      }
      if (statement.kind !== 'definition' && statement.kind !== 'display' && statement.kind !== 'check') {
        results.push({ statement, status: 'none', ...none, diagnostics: parseDiagnostics });
        return;
      }

      if (statement.kind === 'definition') {
        const clash = statement.name in BUILTIN_CONSTANTS ? 'E-RESERVED' : env.has(statement.name) || tables.has(statement.name) ? 'E-REDEFINED' : undefined;
        if (clash) {
          const d = diagnostic(clash, statement.nameSpan, { name: statement.name });
          results.push({ statement, status: 'error', ...none, diagnostics: [...parseDiagnostics, d] });
          return;
        }
      }

      const key = source.slice(statement.span.offset, statement.span.offset + statement.span.length);
      const cached = this.cache.get(key);
      let result: PartialResult;
      // Results with diagnostics are not reused: their spans point into the old source.
      const fresh = cached && cached.result.diagnostics.length === 0 && cached.deps.every(([dep, fp]) => currentFingerprint(env, tables, dep) === fp);
      if (cached && fresh) {
        result = cached.result;
        reused++;
      } else {
        result = this.evaluateStatement(statement, env, tables, definedAt, index);
        evaluated++;
      }
      nextCache.set(key, {
        deps: result.dependencies.map((dep) => [dep, currentFingerprint(env, tables, dep)] as const),
        result,
      });

      if (statement.kind === 'definition') {
        env.set(statement.name, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
      }
      results.push({ statement, ...result, diagnostics: [...parseDiagnostics, ...result.diagnostics] });
    });

    this.cache = nextCache;
    const values = new Map<string, Value>();
    for (const [name, entry] of env) if (entry.ok) values.set(name, entry.value);

    return {
      source,
      sheet: parsed.sheet,
      statements: results,
      values,
      tables,
      diagnostics: results.flatMap((r) => r.diagnostics),
      checks: checkSummary(results),
      stats: { evaluated, reused },
    };
  }

  private evaluateStatement(
    statement: Evaluable,
    env: ReadonlyMap<string, EnvEntry>,
    tables: ReadonlyMap<string, Table>,
    definedAt: ReadonlyMap<string, number>,
    index: number,
  ): PartialResult {
    const dependencies: string[] = [];
    const tableReads: TableRead[] = [];
    const ctx: EvalContext = {
      registry: this.registry,
      warnings: [],
      tableReads,
      lookup(name: string, span: Span): Value {
        const entry = env.get(name);
        // Unknown names are recorded too, so defining them later invalidates the cache.
        if (!dependencies.includes(name)) dependencies.push(name);
        if (entry?.ok) return entry.value;
        if (entry) throw new DependencyFailed(name);
        const table = tables.get(name);
        if (table) return { type: 'table', table };
        const at = definedAt.get(name);
        if (at !== undefined && at > index) throw new CalcError(diagnostic('E-DEFINED-LATER', span, { name }));
        throw new CalcError(diagnostic('E-UNDEFINED', span, { name }));
      },
    };

    try {
      if (statement.kind === 'check') {
        const check = evaluateCheck(statement, ctx);
        return {
          status: 'ok',
          value: { type: 'boolean', value: check.passed },
          check,
          dependencies,
          tableReads,
          diagnostics: ctx.warnings,
        };
      }

      let value = evaluate(statement.expr, ctx);
      let target: ResolvedUnit | undefined;
      if (statement.target) {
        target = resolveUnit(statement.target, this.registry);
        if (value.type !== 'quantity' || !sameDim(target.dim, value.dim)) {
          const found = value.type === 'quantity' ? baseUnitSymbol(value.dim) : value.type;
          throw new CalcError(diagnostic('E-TARGET-UNIT', statement.target.span, { unit: target.symbol, found }));
        }
        // The value keeps its target unit when used further on.
        value = { ...value, hint: target };
      }
      const display = value.type === 'quantity' ? toDisplay(value, this.registry, target) : undefined;
      return {
        status: 'ok',
        value,
        ...(display ? { display } : {}),
        dependencies,
        tableReads,
        diagnostics: ctx.warnings,
      };
    } catch (err) {
      if (err instanceof DependencyFailed) {
        const d = diagnostic('I-DEPENDENCY-FAILED', statement.expr.span, { name: err.message });
        return { status: 'blocked', dependencies, tableReads, diagnostics: [...ctx.warnings, d] };
      }
      if (err instanceof CalcError) {
        return { status: 'error', dependencies, tableReads, diagnostics: [...ctx.warnings, err.diagnostic] };
      }
      throw err;
    }
  }
}

/**
 * A single comparison gives a utilization; any other boolean condition
 * (a and b, flags from tables) only passes or fails.
 */
function evaluateCheck(statement: Extract<Statement, { kind: 'check' }>, ctx: EvalContext): CheckResult {
  const info = {
    ...(statement.label !== undefined ? { label: statement.label } : {}),
    ...(statement.source !== undefined ? { source: statement.source } : {}),
  };
  const expr = statement.expr;
  if (expr.kind === 'binary' && CHECK_OPERATORS.has(expr.operator)) {
    const left = asQuantity(evaluate(expr.left, ctx), expr.left.span);
    const right = asQuantity(evaluate(expr.right, ctx), expr.right.span);
    const passed = asBoolean(compare(expr.operator, left, right, expr.span), expr.span);
    const utilization = utilizationOf(expr.operator, left, right);
    return { ...info, passed, operator: expr.operator, left, right, ...(utilization !== undefined ? { utilization } : {}) };
  }
  return { ...info, passed: asBoolean(evaluate(expr, ctx), expr.span) };
}

function utilizationOf(op: BinaryOperator, left: Quantity, right: Quantity): number | undefined {
  // Ratios of absolute temperatures or of negative values mean nothing.
  if (left.absolute || right.absolute) return undefined;
  if (op === '<' || op === '<=') return left.si >= 0 && right.si > 0 ? left.si / right.si : undefined;
  return right.si >= 0 && left.si > 0 ? right.si / left.si : undefined;
}

function checkSummary(results: readonly StatementResult[]): CheckSummaryItem[] {
  return results.flatMap((r, index): CheckSummaryItem[] => {
    if (r.statement.kind !== 'check') return [];
    if (r.check) return [{ ...r.check, statement: index }];
    // Not evaluated (error or blocked): listed as failed so it cannot be overlooked.
    const { label, source } = r.statement;
    return [{ statement: index, passed: false, ...(label !== undefined ? { label } : {}), ...(source !== undefined ? { source } : {}) }];
  });
}

/** Evaluates a sheet once, without keeping a cache. */
export function evaluateSheet(source: string, options: SessionOptions & UpdateOptions = {}): SheetResult {
  return new SheetSession(options).update(source, options);
}

function currentFingerprint(env: ReadonlyMap<string, EnvEntry>, tables: ReadonlyMap<string, Table>, name: string): string {
  const entry = env.get(name);
  if (!entry) return tables.get(name)?.fingerprint ?? 'missing';
  return entry.ok ? fingerprint(entry.value) : 'failed';
}

function within(inner: Span, outer: Span): boolean {
  return inner.offset >= outer.offset && inner.offset <= outer.offset + outer.length;
}
