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
import { defineFunction, isBuiltinFunction } from '../eval/userFunctions.js';
import { solveStatement } from '../eval/solver.js';
import type { BlockCaller, BlockSource } from '../eval/blocks.js';
import type { BinaryOperator, Sheet, Statement } from '../lang/ast.js';
import { parse } from '../lang/parser.js';
import type { Table, TableRead } from '../tables/table.js';
import { sameDim } from '../units/dimension.js';
import { baseUnitSymbol, toDisplay, type DisplayValue } from '../units/display.js';
import { defaultRegistry, type UnitRegistry } from '../units/registry.js';
import { resolveUnit, type ResolvedUnit } from '../units/unitExpr.js';
import { fingerprint, typeName, type Quantity, type Value } from '../values/value.js';

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
  /** Values found by a solve statement, in the order of its unknowns. */
  readonly solutions?: readonly { readonly name: string; readonly value: Quantity; readonly display: DisplayValue }[];
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
  /** Values taken from auxiliary calculation layers, by name. */
  readonly imports: ReadonlyMap<string, ImportedValue>;
  readonly diagnostics: readonly Diagnostic[];
  /** All checks in sheet order; failed or not evaluated ones included. */
  readonly checks: readonly CheckSummaryItem[];
  /** How many statements were evaluated vs. taken from the cache. */
  readonly stats: { readonly evaluated: number; readonly reused: number };
}

export interface SessionOptions {
  readonly registry?: UnitRegistry;
}

/** A value computed in another layer (an auxiliary calculation) and used here by name. */
export interface ImportedValue {
  readonly value: Value;
  /** Id and name of the layer it comes from. */
  readonly layer: string;
  readonly layerName: string;
}

export interface UpdateOptions {
  /** Tables of the sheet's data layers, available by name. */
  readonly tables?: readonly Table[];
  /** Results of auxiliary calculation layers, available by name. */
  readonly imports?: ReadonlyMap<string, ImportedValue>;
  /** Blocks stored in the sheet, callable by name. */
  readonly blocks?: ReadonlyMap<string, BlockSource>;
  /** Values for the "input" lines, when this sheet is calculated as a block. */
  readonly inputs?: ReadonlyMap<string, Value>;
  /** Blocks being calculated around this one, to stop a block from using itself. */
  readonly blockStack?: readonly string[];
}

type EnvEntry = { readonly ok: true; readonly value: Value } | { readonly ok: false };
type Evaluable = Extract<Statement, { kind: 'definition' | 'display' | 'check' | 'solve' }>;
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
    const imports: ReadonlyMap<string, ImportedValue> = options.imports ?? new Map();
    const blocks: ReadonlyMap<string, BlockSource> = options.blocks ?? new Map();
    const inputs: ReadonlyMap<string, Value> = options.inputs ?? new Map();
    const context: StatementContext = { env: new Map(), tables, imports, blocks, inputs, blockStack: options.blockStack ?? [] };
    const parsed = parse(source, { isUnit: (name) => registry.isUnit(name), predefined: [...tables.keys(), ...imports.keys()] });
    const statements = parsed.sheet.statements;

    const definedAt = new Map<string, number>();
    statements.forEach((s, i) => {
      const names = s.kind === 'definition' || s.kind === 'invalid' ? (s.name !== undefined ? [s.name] : []) : s.kind === 'solve' ? s.unknowns.map((u) => u.name) : [];
      for (const name of names) if (!definedAt.has(name)) definedAt.set(name, i);
    });

    const env = context.env;
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
      if (statement.kind !== 'definition' && statement.kind !== 'display' && statement.kind !== 'check' && statement.kind !== 'solve') {
        results.push({ statement, status: 'none', ...none, diagnostics: parseDiagnostics });
        return;
      }

      if (statement.kind === 'solve') {
        const taken = statement.unknowns.find((u) => u.name in BUILTIN_CONSTANTS || env.has(u.name) || tables.has(u.name) || imports.has(u.name) || blocks.has(u.name));
        if (taken) {
          const d = diagnostic(taken.name in BUILTIN_CONSTANTS ? 'E-RESERVED' : 'E-REDEFINED', taken.span, { name: taken.name });
          statement.unknowns.forEach((u) => env.has(u.name) || env.set(u.name, { ok: false }));
          results.push({ statement, status: 'error', ...none, diagnostics: [...parseDiagnostics, d] });
          return;
        }
      }
      if (statement.kind === 'definition') {
        const reserved = statement.name in BUILTIN_CONSTANTS || (statement.params !== undefined && isBuiltinFunction(statement.name));
        const clash = reserved
          ? 'E-RESERVED'
          : env.has(statement.name) || tables.has(statement.name) || imports.has(statement.name) || blocks.has(statement.name) ? 'E-REDEFINED' : undefined;
        if (clash) {
          const d = diagnostic(clash, statement.nameSpan, { name: statement.name });
          results.push({ statement, status: 'error', ...none, diagnostics: [...parseDiagnostics, d] });
          return;
        }
      }

      // An input given from outside is part of what the line means.
      const given = statement.kind === 'definition' && statement.input ? inputs.get(statement.name) : undefined;
      const key = source.slice(statement.span.offset, statement.span.offset + statement.span.length) + (given ? `\u0000${fingerprint(given)}` : '');
      const cached = this.cache.get(key);
      let result: PartialResult;
      // Results with diagnostics are not reused: their spans point into the old source.
      const fresh = cached && cached.result.diagnostics.length === 0 && cached.deps.every(([dep, fp]) => currentFingerprint(context, dep) === fp);
      if (cached && fresh) {
        result = cached.result;
        reused++;
      } else {
        result = this.evaluateStatement(statement, context, definedAt, index);
        evaluated++;
      }
      nextCache.set(key, {
        deps: result.dependencies.map((dep) => [dep, currentFingerprint(context, dep)] as const),
        result,
      });

      if (statement.kind === 'definition') {
        env.set(statement.name, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
      }
      if (statement.kind === 'solve') {
        statement.unknowns.forEach((u, i) => {
          const found = result.solutions?.[i];
          env.set(u.name, found ? { ok: true, value: found.value } : { ok: false });
        });
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
      imports,
      diagnostics: results.flatMap((r) => r.diagnostics),
      checks: checkSummary(results),
      stats: { evaluated, reused },
    };
  }

  /** Calculates a block as a sheet of its own, with the inputs given at the call. */
  private blockCaller(context: StatementContext, dependencies: string[]): BlockCaller {
    return {
      has: (name) => context.blocks.has(name),
      call: (name, given, span) => {
        const block = context.blocks.get(name)!;
        const dependency = `${BLOCK_DEPENDENCY}${name}`;
        if (!dependencies.includes(dependency)) dependencies.push(dependency);
        if (context.blockStack.includes(name)) throw new CalcError(diagnostic('E-RECURSION', span, { function: name }));
        const result = new SheetSession({ registry: this.registry }).update(block.source, {
          tables: [...context.tables.values()],
          blocks: context.blocks,
          inputs: new Map([...given].map(([input, arg]) => [input, arg.value])),
          blockStack: [...context.blockStack, name],
        });
        // Tables the block read are dependencies of the call too.
        for (const r of result.statements) {
          for (const dep of r.dependencies) if (context.tables.has(dep) && !dependencies.includes(dep)) dependencies.push(dep);
        }
        const inputNames = new Set(result.sheet.statements.flatMap((s) => (s.kind === 'definition' && s.input ? [s.name] : [])));
        for (const [input, arg] of given) {
          if (!inputNames.has(input)) throw new CalcError(diagnostic('E-NAMED-ARG', arg.nameSpan, { function: name, argument: input, problem: 'unknown' }));
        }
        const inputError = result.diagnostics.find((d) => d.code === 'E-BLOCK-INPUT');
        if (inputError) throw new CalcError({ ...inputError, span: given.get(String(inputError.params['name']))?.nameSpan ?? span });
        const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
        if (errors > 0) throw new CalcError(diagnostic('E-BLOCK-ERROR', span, { block: name, count: errors }));
        return {
          type: 'record',
          block: name,
          version: block.version,
          inputs: new Map([...given].map(([input, arg]) => [input, arg.value])),
          values: result.values,
          result,
        };
      },
    };
  }

  private evaluateStatement(statement: Evaluable, context: StatementContext, definedAt: ReadonlyMap<string, number>, index: number): PartialResult {
    const { env, tables, imports } = context;
    const dependencies: string[] = [];
    const tableReads: TableRead[] = [];
    const ctx: EvalContext = {
      registry: this.registry,
      warnings: [],
      tableReads,
      ...(context.blocks.size > 0 ? { blocks: this.blockCaller(context, dependencies) } : {}),
      lookup(name: string, span: Span): Value {
        const entry = env.get(name);
        // Unknown names are recorded too, so defining them later invalidates the cache.
        if (!dependencies.includes(name)) dependencies.push(name);
        if (entry?.ok) return entry.value;
        if (entry) throw new DependencyFailed(name);
        const imported = imports.get(name);
        if (imported) return imported.value;
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

      if (statement.kind === 'solve') {
        const found = solveStatement(statement, ctx, evaluate);
        const solutions = statement.unknowns.map((u, i) => ({ name: u.name, value: found[i]!, display: toDisplay(found[i]!, this.registry) }));
        return { status: 'ok', solutions, dependencies, tableReads, diagnostics: ctx.warnings };
      }

      if (statement.kind === 'definition' && statement.params) {
        const fn = defineFunction({ ...statement, params: statement.params }, ctx);
        return { status: 'ok', value: fn, dependencies, tableReads, diagnostics: ctx.warnings };
      }

      let value = evaluate(statement.expr, ctx);
      if (statement.kind === 'definition' && statement.input) {
        const given = context.inputs.get(statement.name);
        if (given) value = acceptInput(statement, value, given, context.blockStack.at(-1) ?? '');
      }
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
        const d = diagnostic('I-DEPENDENCY-FAILED', statement.kind === 'solve' ? statement.span : statement.expr.span, { name: err.message });
        return { status: 'blocked', dependencies, tableReads, diagnostics: [...ctx.warnings, d] };
      }
      if (err instanceof CalcError) {
        return { status: 'error', dependencies, tableReads, diagnostics: [...ctx.warnings, err.diagnostic] };
      }
      throw err;
    }
  }
}

/** A value given for a block input must be of the same kind as the block's own. */
function acceptInput(statement: Extract<Statement, { kind: 'definition' }>, own: Value, given: Value, block: string): Value {
  if (own.type === 'quantity' && given.type === 'quantity') {
    if (!sameDim(own.dim, given.dim) || !!own.absolute !== !!given.absolute) {
      throw new CalcError(diagnostic('E-BLOCK-INPUT', statement.nameSpan, { block, name: statement.name, expected: baseUnitSymbol(own.dim), found: baseUnitSymbol(given.dim) }));
    }
    return given;
  }
  if (own.type !== given.type) {
    throw new CalcError(diagnostic('E-BLOCK-INPUT', statement.nameSpan, { block, name: statement.name, expected: typeName(own), found: typeName(given) }));
  }
  return given;
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

/** What evaluating one line needs besides the line itself. */
interface StatementContext {
  readonly env: Map<string, EnvEntry>;
  readonly tables: ReadonlyMap<string, Table>;
  readonly imports: ReadonlyMap<string, ImportedValue>;
  readonly blocks: ReadonlyMap<string, BlockSource>;
  readonly inputs: ReadonlyMap<string, Value>;
  readonly blockStack: readonly string[];
}

/** Dependency on a block's text: recorded as "block:<name>". */
const BLOCK_DEPENDENCY = 'block:';

function currentFingerprint(context: StatementContext, name: string): string {
  const { env, tables, imports, blocks } = context;
  if (name.startsWith(BLOCK_DEPENDENCY)) {
    const block = blocks.get(name.slice(BLOCK_DEPENDENCY.length));
    return block ? `${block.version}:${block.source}` : 'missing';
  }
  const entry = env.get(name);
  if (!entry) {
    const imported = imports.get(name);
    if (imported) return `${imported.layer}:${fingerprint(imported.value)}`;
    return tables.get(name)?.fingerprint ?? 'missing';
  }
  return entry.ok ? fingerprint(entry.value) : 'failed';
}

function within(inner: Span, outer: Span): boolean {
  return inner.offset >= outer.offset && inner.offset <= outer.offset + outer.length;
}
