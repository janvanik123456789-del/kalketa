/**
 * Sheet evaluation with incremental recalculation.
 *
 * A sheet is read top to bottom: a name must be defined above its first use
 * and may be defined only once, so there are no cycles. The dependency graph
 * is recorded per statement; when the source changes, a statement is
 * re-evaluated only if its own text or the value of one of its dependencies
 * changed.
 */

import { CalcError, DependencyFailed, diagnostic, type Diagnostic, type Span } from '../diagnostics.js';
import { asBoolean, asComplex } from '../eval/coerce.js';
import { compare, evaluate, LINE_TIME_LIMIT_MS, withTimeLimit, type EvalContext } from '../eval/evaluator.js';
import { BUILTIN_CONSTANTS } from '../eval/functions.js';
import { defineFunction, isBuiltinFunction } from '../eval/userFunctions.js';
import { allRoots, solveStatement, type RootsFound } from '../eval/solver.js';
import { solveOde, type OdeInfo } from '../eval/ode.js';
import { isPlotCall, plotStatement, type PlotResult } from '../eval/plot.js';
import { checkDerivation, type DerivationStep, type SheetRelation } from '../eval/derive.js';
import { DIMENSIONLESS_NAME } from '../lang/parser.js';
import { DIMENSIONLESS, dim, type Dimension } from '../units/dimension.js';
import type { BlockCaller, BlockSource } from '../eval/blocks.js';
import { TABLE_TOTAL, type BinaryOperator, type Expr, type Inequality, type LineFormat, type Sheet, type Statement } from '../lang/ast.js';
import { parse } from '../lang/parser.js';
import { buildTable, rowLabel, type ColumnSchema, type Table, type TableBuildResult, type TableRead } from '../tables/table.js';
import { COMPARE_FUNCTION } from '../eval/tables.js';
import { sameDim } from '../units/dimension.js';
import { isDifferenceName } from '../lang/parser.js';
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
  /** Items of a series, all in one unit. */
  readonly displayList?: readonly DisplayValue[];
  /** A matrix result, item by item. */
  readonly displayMatrix?: { readonly rows: number; readonly cols: number; readonly items: readonly DisplayValue[] };
  readonly check?: CheckResult;
  /** A chart: plot(M(x), x: 0 m .. L). */
  readonly plot?: PlotResult;
  /** A derivation (derive a == b, y := a == b == c): whether each step holds. */
  readonly derivation?: readonly DerivationStep[];
  /**
   * The variant chosen: of a table of variants (table Varianty: {variants=B}) the row whose values the sheet
   * calculates with; of a comparison (compare(Varianty, M)) its row of the chosen variant.
   */
  readonly variant?: { readonly key: string; readonly row: number };
  /** A heading that starts a position: its label (1, 2, 3a), its values then read as Pos1.A. */
  readonly position?: string;
  /** A differential equation solved (solve w(x): …): its order and interval; the function is the value. */
  readonly ode?: OdeInfo;
  /** Values found by a solve statement, in the order of its unknowns; the formula of one expressed. */
  readonly solutions?: readonly { readonly name: string; readonly value: Quantity; readonly display: DisplayValue; readonly formula?: Expr; readonly relation?: Inequality }[];
  /** The equation of a solve line with the functions of the sheet written out (y′(x) = 0 as 2·a·x + b = 0). */
  readonly expanded?: { readonly left: Expr; readonly right: Expr };
  /** solve x ∈ ℝ, x > 0: every root as on paper, each kept or set aside; the unknown holds the kept ones. */
  readonly roots?: RootsFound;
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
  /** The variant to calculate, by the name of its table: a run of compare(Varianty, …), whose own lines are left out. */
  readonly variants?: ReadonlyMap<string, string>;
}

type EnvEntry = { readonly ok: true; readonly value: Value } | { readonly ok: false };
type Evaluable = Extract<Statement, { kind: 'definition' | 'display' | 'check' | 'solve' | 'derive' }>;
type PartialResult = Omit<StatementResult, 'statement'>;

interface CacheEntry {
  readonly deps: readonly (readonly [string, string])[];
  readonly result: PartialResult;
}

const CHECK_OPERATORS: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);


export class SheetSession {
  private readonly registry: UnitRegistry;
  private cache = new Map<string, CacheEntry>();
  /** The sheet calculated for each variant compared, kept to recalculate only what changed. */
  private variantSessions = new Map<string, SheetSession>();

  constructor(options: SessionOptions = {}) {
    this.registry = options.registry ?? defaultRegistry;
  }

  update(source: string, options: UpdateOptions = {}): SheetResult {
    const registry = this.registry;
    const tables = new Map((options.tables ?? []).map((t) => [t.name, t] as const));
    const imports: ReadonlyMap<string, ImportedValue> = options.imports ?? new Map();
    const blocks: ReadonlyMap<string, BlockSource> = options.blocks ?? new Map();
    const inputs: ReadonlyMap<string, Value> = options.inputs ?? new Map();
    const parsed = parse(source, { isUnit: (name) => registry.isUnit(name), predefined: [...tables.keys(), ...imports.keys()] });
    const statements = parsed.sheet.statements;
    // A sheet with its own units calculates with its own copy of the registry.
    const ownUnits = statements.filter((s) => s.kind === 'unit' || s.kind === 'dimension');
    const context: StatementContext = {
      env: new Map(),
      tables,
      imports,
      blocks,
      inputs,
      blockStack: options.blockStack ?? [],
      registry: ownUnits.length > 0 ? registry.extend() : registry,
      dimensions: new Set(),
      formulas: new Map(),
      relations: [],
    };
    // Every result depends on the sheet's own units: changing one recalculates all.
    const unitsKey = ownUnits.map((s) => source.slice(s.span.offset, s.span.offset + s.span.length)).join('\n');

    const definedAt = new Map<string, number>();
    statements.forEach((s, i) => {
      const names = definedNames(s);
      for (const name of names) if (!definedAt.has(name)) definedAt.set(name, i);
    });

    // The formulas a chart may hatch by their name (area: P, area: Integral1), wherever they stand in the
    // sheet: a chart above its integral still finds it. Their text is part of what such a chart means.
    const namedFormulas = new Map<string, { expr: Expr; text: string }>();
    for (const s of statements) {
      const text = source.slice(s.span.offset, s.span.offset + s.span.length);
      if (s.kind === 'definition' && !s.params && !s.input) namedFormulas.set(s.name, { expr: s.expr, text });
      if (typeof s.format?.eq === 'string' && (s.kind === 'display' || s.kind === 'definition')) namedFormulas.set(`#${s.format.eq}`, { expr: s.expr, text });
      // A relation by its name (relation x^2 + y^2 == r^2 {eq=Kruh}): its equation, drawn or solved by that name.
      if (typeof s.format?.eq === 'string' && s.kind === 'derive' && s.relation) namedFormulas.set(`#${s.format.eq}`, { expr: relationExpr(s), text });
    }
    context.namedFormulas = namedFormulas;
    // What a line using relations means depends on their text too: a derivation below them, a chart or a solve by their name.
    const relations = statements.filter((s): s is Extract<Statement, { kind: 'derive' }> => s.kind === 'derive' && !!s.relation);
    const relationNames = relations.flatMap((s) => (typeof s.format?.eq === 'string' ? [s.format.eq] : []));
    const relationsKey = relations.map((s) => `${source.slice(s.span.offset, s.span.offset + s.span.length)} ${String(s.format?.eq ?? '')}`).join('\u0001');
    const usesRelations = (statement: Statement, text: string) =>
      relations.length > 0 &&
      ((statement.kind === 'derive' && !statement.relation) || (statement.kind === 'definition' && !!statement.derivation) || relationNames.some((name) => wordIn(text, name)));
    const env = context.env;
    const results: StatementResult[] = [];
    const drawnLater: { at: number; statement: Extract<Statement, { kind: 'display' }>; parseDiagnostics: Diagnostic[] }[] = [];
    const nextCache = new Map<string, CacheEntry>();
    let evaluated = 0;
    let reused = 0;
    const none = { dependencies: [], tableReads: [] } as const;

    // Positions: the names defined in one hold until the next one starts; then they are its
    // values (Pos1.A) and the next position may define the same names again.
    let position: { label: string; names: string[] } | undefined;
    let numbered = 0;
    // The last position keeps its names at the end of the sheet: the values of the sheet stay
    // whole for what reads them (other layers, the values a canvas shows).
    const closePosition = (last = false) => {
      if (!position) return;
      const values = new Map<string, Value>();
      for (const name of position.names) {
        const entry = env.get(name);
        if (entry?.ok) values.set(name, entry.value);
        if (last) continue;
        env.delete(name);
        context.formulas.delete(name);
      }
      env.set(positionName(position.label), { ok: true, value: { type: 'record', block: positionName(position.label), version: '', inputs: new Map(), values, position: position.label } });
      position = undefined;
    };
    const definedHere = (statement: Statement) => {
      if (!position) return;
      for (const name of definedNames(statement)) if (env.has(name) && !position.names.includes(name)) position.names.push(name);
    };
    // Tables of variants read so far, each with the key of the variant chosen.
    const variantTables = new Map<string, { table: Table; chosen?: string }>();
    const usedVariantSessions = new Map<string, SheetSession>();

    statements.forEach((statement, index) => {
      const parseDiagnostics = parsed.diagnostics.filter((d) => within(d.span, statement.span));

      if (statement.kind === 'heading' && statement.format?.pos !== undefined) {
        closePosition();
        const given = statement.format.pos;
        // A number given goes on from there (pos=3 and then pos is 4); a label like 3a does not.
        const label = given === true ? String(++numbered) : given;
        if (given !== true && /^\d+$/.test(given)) numbered = Number(given);
        position = { label, names: [] };
        results.push({ statement, status: 'none', ...none, position: label, diagnostics: parseDiagnostics });
        return;
      }

      if (statement.kind === 'invalid') {
        if (statement.name !== undefined && !env.has(statement.name)) env.set(statement.name, { ok: false });
        results.push({ statement, status: 'error', ...none, diagnostics: parseDiagnostics });
        return;
      }
      if (statement.kind === 'table') {
        const taken = statement.name in BUILTIN_CONSTANTS || env.has(statement.name) || tables.has(statement.name) || imports.has(statement.name) || blocks.has(statement.name);
        if (taken) {
          results.push({ statement, status: 'error', ...none, diagnostics: [...parseDiagnostics, diagnostic('E-REDEFINED', statement.nameSpan, { name: statement.name })] });
          return;
        }
        // Calculated columns read the values of the sheet above the table.
        const outer = (name: string, span: Span): Value => {
          const entry = env.get(name);
          if (entry?.ok) return entry.value;
          if (entry) throw new DependencyFailed(name);
          const imported = imports.get(name);
          if (imported) return imported.value;
          const table = tables.get(name);
          if (table) return { type: 'table', table };
          const at = definedAt.get(name);
          if (at !== undefined && at > index) throw new CalcError(diagnostic('E-DEFINED-LATER', span, { name }));
          throw new CalcError(diagnostic('E-UNDEFINED', span, { name }));
        };
        const built = sheetTable(statement, context.registry, outer);
        env.set(statement.name, { ok: true, value: { type: 'table', table: built.table } });
        // Variants: the other columns are names of the sheet, with the values of the row chosen.
        const variantDiagnostics: Diagnostic[] = [];
        let variant: { key: string; row: number } | undefined;
        if (statement.format?.variants !== undefined) {
          const table = built.table;
          const keys = table.rows.map((_, r) => rowLabel(table, r));
          const wanted = options.variants?.get(statement.name) ?? (statement.format.variants === true ? undefined : statement.format.variants);
          const row = wanted === undefined ? (keys.length > 0 ? 0 : -1) : keys.indexOf(wanted);
          if (row < 0) variantDiagnostics.push(diagnostic('E-VARIANT-UNKNOWN', statement.nameSpan, { table: statement.name, variant: wanted ?? '' }));
          else variant = { key: keys[row]!, row };
          variantTables.set(statement.name, { table, ...(variant ? { chosen: variant.key } : {}) });
          table.columns.forEach((column, c) => {
            if (column.name === table.key) return;
            const clash = column.name in BUILTIN_CONSTANTS || env.has(column.name) || tables.has(column.name) || imports.has(column.name) || blocks.has(column.name);
            if (clash) return void variantDiagnostics.push(diagnostic('E-REDEFINED', statement.nameSpan, { name: column.name }));
            const cell = row >= 0 ? table.rows[row]![c] : undefined;
            if (row >= 0 && !cell) variantDiagnostics.push(diagnostic('E-TABLE-EMPTY', statement.span, { table: statement.name, column: column.name, row: keys[row]! }));
            env.set(column.name, cell ? { ok: true, value: cell } : { ok: false });
          });
        }
        definedHere(statement);
        const tableDiagnostics = [...parseDiagnostics, ...built.diagnostics, ...variantDiagnostics];
        const failed = variantDiagnostics.some((d) => d.severity === 'error');
        results.push({ statement, status: failed ? 'error' : 'ok', value: { type: 'table', table: built.table }, ...none, ...(variant ? { variant } : {}), diagnostics: tableDiagnostics });
        return;
      }
      if (statement.kind === 'dimension' || statement.kind === 'unit') {
        const d = this.defineUnit(statement, context, index, definedAt);
        results.push({ statement, status: d.status, ...none, dependencies: d.dependencies, diagnostics: [...parseDiagnostics, ...d.diagnostics] });
        return;
      }
      if (statement.kind !== 'definition' && statement.kind !== 'display' && statement.kind !== 'check' && statement.kind !== 'solve' && statement.kind !== 'derive') {
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

      // compare(Varianty, M, σ): the sheet again for each variant; in such a run the line itself is left out.
      if ((statement.kind === 'definition' || statement.kind === 'display') && !(statement.kind === 'definition' && statement.params) && statement.expr.kind === 'call' && statement.expr.name === COMPARE_FUNCTION) {
        const result: PartialResult = options.variants
          ? { status: 'none', ...none, diagnostics: [] }
          : this.compareVariants(statement.expr, source, options, variantTables, usedVariantSessions);
        evaluated++;
        if (statement.kind === 'definition') env.set(statement.name, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
        definedHere(statement);
        results.push({ statement, ...result, diagnostics: [...parseDiagnostics, ...result.diagnostics] });
        return;
      }
      // An input given from outside is part of what the line means.
      const given = statement.kind === 'definition' && statement.input ? inputs.get(statement.name) : undefined;
      // The format of the line ({decimals=2 rounded}) is not in its span, yet rounded changes its value.
      const key =
        source.slice(statement.span.offset, statement.span.offset + statement.span.length) +
        (given ? `\u0000${fingerprint(given)}` : '') +
        (unitsKey ? `\u0000${unitsKey}` : '') +
        (statement.format?.rounded ? `\u0000${JSON.stringify(statement.format)}` : '') +
        // A chart hatching a formula by its name: that formula's text too (it may stand below the chart).
        (statement.kind === 'display' && /\barea\s*:\s*[\p{L}_]/u.test(source.slice(statement.span.offset, statement.span.offset + statement.span.length))
          ? `\u0000${[...namedFormulas.values()].map((f) => f.text).join('\u0001')}`
          : '') +
        (usesRelations(statement, source.slice(statement.span.offset, statement.span.offset + statement.span.length)) ? `\u0000${relationsKey}` : '');
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

      // A line named for references ({eq=Integral1}) is reachable by that name too, as #Integral1:
      // its formula and value (a chart hatches the area of the integral so named).
      const eqName = typeof statement.format?.eq === 'string' ? statement.format.eq : undefined;
      if (eqName && (statement.kind === 'display' || statement.kind === 'definition')) {
        env.set(`#${eqName}`, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
        context.formulas.set(`#${eqName}`, statement.expr);
      }
      if (statement.kind === 'derive' && statement.relation) context.relations.push({ expr: relationExpr(statement), ...(typeof statement.format?.eq === 'string' ? { label: statement.format.eq } : {}), line: statement.span.line });
      if (statement.kind === 'definition') {
        env.set(statement.name, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
        // A derivation ending in numbers (M := q·L²/8 == … == 37.5 kN·m) stands for its general formula, the first member.
        if (!statement.params && !statement.input) context.formulas.set(statement.name, statement.derivation?.[0] ?? statement.expr);
      }
      if (statement.kind === 'solve') {
        statement.unknowns.forEach((u, i) => {
          // The solution of a differential equation is a function, its value.
          if (statement.ode) return env.set(u.name, result.status === 'ok' && result.value ? { ok: true, value: result.value } : { ok: false });
          // Under conditions: the roots kept, one as a value, more as a vector (x[1], x[2]); none, no value.
          if (result.roots) {
            // The roots as printed, x₁ and x₂, are names too (x_1, x_2) for what follows: an integral
            // between them. Complex ones only where they count (∈ ℂ); a name the sheet defines itself stays its own.
            const real = result.roots.roots.filter((r) => r.rejected !== 'complex');
            // Roots not real (D < 0 in ℝ): the names are there, without a value, so the lines that read them
            // are left out as not to be calculated, not reported as wrong.
            if (result.roots.roots.length > 1) {
              result.roots.roots.forEach((r, k) => {
                const own = `${u.name}_${k + 1}`;
                if (definedAt.has(own)) return;
                env.set(own, r.rejected !== 'complex' && real.length > 0 ? { ok: true, value: r.value } : { ok: false });
              });
            }
            const kept = result.roots.roots.filter((r) => r.rejected === undefined).map((r) => r.value);
            return env.set(u.name, kept.length === 1 ? { ok: true, value: kept[0]! } : kept.length > 1 ? { ok: true, value: { type: 'vector', items: kept } } : { ok: false });
          }
          const found = result.solutions?.[i];
          env.set(u.name, found ? { ok: true, value: found.value } : { ok: false });
        });
      }
      definedHere(statement);
      // A chart is a view of the sheet: standing above what it draws (a chart moved up to the inputs), it is
      // drawn once the whole sheet is calculated, as if it stood at the end.
      if (statement.kind === 'display' && isPlotCall(statement.expr) && result.status === 'error' && result.dependencies.some((d) => (definedAt.get(d) ?? -1) > index)) {
        drawnLater.push({ at: results.length, statement, parseDiagnostics });
      }
      results.push({ statement, ...result, diagnostics: [...parseDiagnostics, ...result.diagnostics] });
    });
    closePosition(true);
    for (const later of drawnLater) {
      const result = this.evaluateStatement(later.statement, context, definedAt, statements.length);
      results[later.at] = { statement: later.statement, ...result, diagnostics: [...later.parseDiagnostics, ...result.diagnostics] };
    }

    this.cache = nextCache;
    this.variantSessions = usedVariantSessions;
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

  /**
   * compare(Varianty, M_Ed, σ): the sheet calculated for each variant of the table, a table of the values named, a
   * row for each variant, and the checks of each: the largest utilization and whether all of them hold.
   */
  private compareVariants(
    call: Extract<Expr, { kind: 'call' }>,
    source: string,
    options: UpdateOptions,
    variantTables: ReadonlyMap<string, { table: Table; chosen?: string }>,
    used: Map<string, SheetSession>,
  ): PartialResult {
    const fail = (code: 'E-COMPARE-TABLE' | 'E-COMPARE-ARG', span: Span, params: Record<string, string> = {}): PartialResult => ({
      status: 'error',
      dependencies: [],
      tableReads: [],
      diagnostics: [diagnostic(code, span, params)],
    });
    const [first, ...rest] = call.args;
    if (!first || first.kind !== 'variable' || !variantTables.has(first.name)) return fail('E-COMPARE-TABLE', first?.span ?? call.span, { name: first?.kind === 'variable' ? first.name : '' });
    const names: string[] = [];
    for (const arg of rest) {
      if (arg.kind !== 'variable') return fail('E-COMPARE-ARG', arg.span);
      names.push(arg.name);
    }
    if (call.named[0]) return fail('E-COMPARE-ARG', call.named[0].nameSpan);
    const { table, chosen: chosenKey } = variantTables.get(first.name)!;
    const runs = table.rows.map((_, r) => {
      const key = rowLabel(table, r);
      const id = `${first.name}\u0000${key}`;
      const session = used.get(id) ?? this.variantSessions.get(id) ?? new SheetSession({ registry: this.registry });
      used.set(id, session);
      return { key, result: session.update(source, { ...options, variants: new Map([[first.name, key]]) }) };
    });
    const diagnostics: Diagnostic[] = [];
    // The values in the unit of the first variant that has them, in full; the print rounds them.
    const columns: ColumnSchema[] = [{ name: table.key, type: 'text' }];
    const cells: string[][] = runs.map((run) => [run.key]);
    const shown: string[] = [];
    names.forEach((name, n) => {
      const values = runs.map((run) => run.result.values.get(name));
      const sample = values.find((v) => v !== undefined);
      if (!sample && !runs.some((run) => run.result.statements.some((s) => definedNames(s.statement).includes(name)))) {
        diagnostics.push(diagnostic('E-UNDEFINED', rest[n]!.span, { name }));
        return;
      }
      const target = sample?.type === 'quantity' ? sample.hint : undefined;
      const unit = sample?.type === 'quantity' ? toDisplay(sample, this.registry).unit : undefined;
      columns.push({ name, type: sample?.type === 'quantity' ? 'quantity' : sample?.type === 'boolean' ? 'boolean' : 'text', ...(unit ? { unit } : {}) });
      shown.push(name);
      values.forEach((v, r) => {
        cells[r]!.push(!v ? '' : v.type === 'quantity' ? String(toDisplay(v, this.registry, target).value) : v.type === 'boolean' ? String(v.value) : v.type === 'text' ? v.value : '');
      });
    });
    // The checks of each variant: the largest utilization, and whether all hold.
    if (runs.some((run) => run.result.checks.length > 0)) {
      columns.push({ name: 'η_max', type: 'quantity', unit: '%' }, { name: '✓', type: 'boolean' });
      runs.forEach((run, r) => {
        const utilizations = run.result.checks.flatMap((c) => (c.utilization !== undefined ? [c.utilization] : []));
        cells[r]!.push(utilizations.length > 0 ? String(Math.max(...utilizations) * 100) : '', String(run.result.checks.every((c) => c.passed)));
      });
    }
    // A variant that cannot be calculated is said, with the names it misses; its cells stay empty.
    runs.forEach((run) => {
      const missing = shown.filter((name) => !run.result.values.has(name));
      if (missing.length > 0) diagnostics.push(diagnostic('W-COMPARE-FAILED', call.span, { variant: run.key, names: missing.join(', ') }));
    });
    const dependencies = [first.name, ...names];
    if (diagnostics.some((d) => d.severity === 'error')) return { status: 'error', dependencies, tableReads: [], diagnostics };
    const built = buildTable({ name: first.name, columns }, cells, this.registry);
    const chosen = runs.findIndex((run) => run.key === chosenKey);
    return {
      status: 'ok',
      value: { type: 'table', table: built.table },
      ...(chosen >= 0 ? { variant: { key: runs[chosen]!.key, row: chosen } } : {}),
      dependencies,
      tableReads: [],
      diagnostics,
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

  /** "dimension Mena" and "unit CZK: Mena" / "unit EUR := 25 CZK": add to the sheet's registry. */
  private defineUnit(
    statement: Extract<Statement, { kind: 'dimension' | 'unit' }>,
    context: StatementContext,
    index: number,
    definedAt: ReadonlyMap<string, number>,
  ): { status: StatementStatus; dependencies: readonly string[]; diagnostics: Diagnostic[] } {
    const registry = context.registry;
    if (statement.kind === 'dimension') {
      const taken = SI_DIMENSIONS.has(statement.name) || context.dimensions.has(statement.name);
      if (taken) return { status: 'error', dependencies: [], diagnostics: [diagnostic('E-REDEFINED', statement.nameSpan, { name: statement.name })] };
      context.dimensions.add(statement.name);
      return { status: 'ok', dependencies: [], diagnostics: [] };
    }
    if (registry.has(statement.name) && !registry.isRedefinable(statement.name)) return { status: 'error', dependencies: [], diagnostics: [diagnostic('E-REDEFINED', statement.nameSpan, { name: statement.name })] };
    if (statement.dimension) {
      const name = statement.dimension.name;
      let dimension: Dimension;
      if (name === DIMENSIONLESS_NAME) dimension = DIMENSIONLESS;
      else if (context.dimensions.has(name)) dimension = dim({ [name]: 1 });
      else return { status: 'error', dependencies: [], diagnostics: [diagnostic('E-UNDEFINED', statement.dimension.span, { name })] };
      registry.define({ symbol: statement.name, factor: 1, dim: dimension }, name === DIMENSIONLESS_NAME ? undefined : name);
      return { status: 'ok', dependencies: [], diagnostics: [] };
    }
    // A unit defined by a value: its size and dimension.
    const result = this.evaluateStatement({ kind: 'display', expr: statement.expr!, span: statement.span }, context, definedAt, index);
    if (result.status !== 'ok' || result.value?.type !== 'quantity') {
      const found = result.value ? typeName(result.value) : undefined;
      const diagnostics = found ? [diagnostic('E-TYPE', statement.expr!.span, { expected: 'number', found })] : [...result.diagnostics];
      return { status: result.status === 'blocked' ? 'blocked' : 'error', dependencies: result.dependencies, diagnostics };
    }
    const size = result.value;
    registry.define({ symbol: statement.name, factor: size.si, dim: size.dim });
    return { status: 'ok', dependencies: result.dependencies, diagnostics: [...result.diagnostics] };
  }

  private evaluateStatement(statement: Evaluable, context: StatementContext, definedAt: ReadonlyMap<string, number>, index: number): PartialResult {
    const { env, tables, imports } = context;
    const dependencies: string[] = [];
    const tableReads: TableRead[] = [];
    const ctx: EvalContext = {
      registry: context.registry,
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

    // ok := a == b of two texts or flags is a comparison after all.
    if (statement.kind === 'definition' && statement.derivation?.length === 2 && !statement.symbolic) {
      const [a, b] = statement.derivation.map((m) => valueOrNothing(() => evaluate(m, { ...ctx, warnings: [] })));
      if (a && b && (a.type === 'text' || a.type === 'boolean') && a.type === b.type) {
        const { derivation: _chain, ...rest } = statement;
        const expr: Expr = { kind: 'binary', operator: '==', left: statement.derivation[0]!, right: statement.derivation[1]!, span: statement.span };
        return this.evaluateValue({ ...rest, expr }, context, ctx, dependencies, tableReads);
      }
    }
    // A derivation is checked step by step; a wrong step is an error, yet the value of its last member
    // is still calculated, so the rest of the sheet does not fall apart.
    const members = statement.kind === 'derive' ? statement.members : statement.kind === 'definition' ? statement.derivation : undefined;
    const params = statement.kind === 'definition' ? statement.params?.map((p) => p.name) : undefined;
    const approx = statement.kind === 'definition' || statement.kind === 'derive' ? statement.approx : undefined;
    // A relation holds by the theory or the task: nothing to check in it.
    if (statement.kind === 'derive' && statement.relation) return { status: 'ok', dependencies, tableReads, diagnostics: ctx.warnings };
    const derived = members ? checkDerivation(members, ctx, evaluate, (name) => context.formulas.get(name), params, approx, context.relations) : undefined;
    if (statement.kind === 'derive') {
      return { status: 'ok', derivation: derived!.steps, dependencies, tableReads, diagnostics: [...ctx.warnings, ...derived!.diagnostics] };
    }
    const withDerivation = (result: PartialResult): PartialResult =>
      derived ? { ...result, derivation: derived.steps, diagnostics: [...result.diagnostics, ...derived.diagnostics] } : result;
    const result = withDerivation(withTimeLimit(LINE_TIME_LIMIT_MS, () => this.evaluateValue(statement, context, ctx, dependencies, tableReads)));
    // A symbol of theory (derive M_mp := l^3·F/3) has no value without values of its names: no error then.
    const noValue = (d: Diagnostic) => d.code === 'E-UNDEFINED' || d.code === 'I-DEPENDENCY-FAILED';
    if (statement.kind === 'definition' && statement.symbolic && (result.status === 'error' || result.status === 'blocked') && result.diagnostics.every((d) => noValue(d) || d.severity !== 'error')) {
      return { ...result, status: 'none', diagnostics: result.diagnostics.filter((d) => !noValue(d)) };
    }
    return result;
  }

  private evaluateValue(
    statement: Exclude<Evaluable, { kind: 'derive' }>,
    context: StatementContext,
    ctx: EvalContext,
    dependencies: string[],
    tableReads: TableRead[],
  ): PartialResult {
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

      // solve y: Kruh — the equation of the relation of that name.
      if (statement.kind === 'solve' && statement.equations.some((e) => e.named !== undefined)) {
        const equations = statement.equations.map((e) => {
          if (e.named === undefined) return e;
          const own = context.namedFormulas?.get(`#${e.named}`)?.expr;
          if (own?.kind !== 'binary' || own.operator !== '==') throw new CalcError(diagnostic('E-SOLVE-RELATION', e.span, { name: e.named }));
          return { left: own.left, right: own.right, span: e.span };
        });
        return this.evaluateValue({ ...statement, equations }, context, ctx, dependencies, tableReads);
      }
      if (statement.kind === 'solve' && statement.ode) {
        const { fn, info } = solveOde(statement, ctx, evaluate);
        return { status: 'ok', value: fn, ode: info, dependencies, tableReads, diagnostics: ctx.warnings };
      }
      if (statement.kind === 'solve' && (statement.domain || statement.conditions)) {
        const roots = allRoots(statement, ctx, evaluate);
        const kept = roots.roots.filter((r) => r.rejected === undefined);
        const only = kept.length === 1 ? kept[0]!.value : undefined;
        const solutions = only ? [{ name: statement.unknowns[0]!.name, value: only, display: toDisplay(only, context.registry) }] : undefined;
        return { status: 'ok', roots, ...(solutions ? { solutions } : {}), dependencies, tableReads, diagnostics: ctx.warnings };
      }
      if (statement.kind === 'solve') {
        const found = solveStatement(statement, ctx, evaluate);
        // {decimals=2 rounded} on a solve line: the rows below go on with the values as shown.
        // "| kN·m": the unknowns in that unit, here and in the rows below.
        const unit = statement.target ? resolveUnit(statement.target, context.registry) : undefined;
        const inUnit = (v: Quantity): Quantity => {
          if (!unit || !statement.target) return v;
          if (!sameDim(unit.dim, v.dim)) throw new CalcError(diagnostic('E-TARGET-UNIT', statement.target.span, { unit: unit.symbol, found: baseUnitSymbol(v.dim) }));
          return inTarget(v, unit);
        };
        const values = found.values.map((v) => inUnit(v)).map((v) => (statement.format?.rounded ? roundedAsShown(v, statement.format, context.registry, unit) : v));
        const solutions = statement.unknowns.map((u, i) => ({
          name: u.name,
          value: values[i]!,
          display: toDisplay(values[i]!, context.registry, unit),
          ...(found.formula ? { formula: found.formula } : {}),
          ...(found.relation ? { relation: found.relation } : {}),
        }));
        return { status: 'ok', solutions, ...(found.expanded ? { expanded: found.expanded } : {}), dependencies, tableReads, diagnostics: ctx.warnings };
      }

      if (statement.kind === 'definition' && statement.params) {
        const fn = defineFunction({ ...statement, params: statement.params }, ctx);
        return { status: 'ok', value: fn, dependencies, tableReads, diagnostics: ctx.warnings };
      }

      if (statement.kind === 'display' && isPlotCall(statement.expr)) {
        const target = statement.target ? resolveUnit(statement.target, context.registry) : undefined;
        const plot = plotStatement(statement.expr, ctx, evaluate, target, (name) => context.formulas.get(name) ?? context.namedFormulas?.get(name)?.expr);
        return { status: 'ok', plot, dependencies, tableReads, diagnostics: ctx.warnings };
      }

      let value = evaluate(statement.expr, ctx);
      if (statement.kind === 'definition' && statement.input) {
        const given = context.inputs.get(statement.name);
        if (given) value = acceptInput(statement, value, given, context.blockStack.at(-1) ?? '');
      }
      let target: ResolvedUnit | undefined;
      if (statement.target) {
        target = resolveUnit(statement.target, context.registry);
        if (value.type === 'vector' || value.type === 'matrix') {
          const unit = target;
          const wrong = value.items.find((q) => !sameDim(unit.dim, q.dim));
          if (wrong) throw new CalcError(diagnostic('E-TARGET-UNIT', statement.target.span, { unit: unit.symbol, found: baseUnitSymbol(wrong.dim) }));
          const items = value.items.map((q) => inTarget(q, unit));
          value = value.type === 'vector' ? { type: 'vector', items } : { ...value, items };
        } else if (value.type !== 'quantity' || !sameDim(target.dim, value.dim)) {
          const found = value.type === 'quantity' ? baseUnitSymbol(value.dim) : value.type;
          throw new CalcError(diagnostic('E-TARGET-UNIT', statement.target.span, { unit: target.symbol, found }));
        } else {
          // The value keeps its target unit when used further on.
          value = inTarget(value, target);
        }
      }
      // T_2 := 894.45 K, T_2 := p_2·V/(m·r): a temperature by its name; ΔT := 10 K stays a difference.
      if (statement.kind === 'definition' && !statement.params && value.type === 'quantity') value = temperatureByName(statement.name, value);
      // {decimals=2 rounded}: the rows below go on with the value as shown, not the exact one.
      if (statement.format?.rounded && value.type === 'quantity') value = roundedAsShown(value, statement.format, context.registry, target);
      const display = value.type === 'quantity' ? toDisplay(value, context.registry, target) : undefined;
      // A series is shown in one unit: the target, else the unit of its first item.
      const unit = target ?? (value.type === 'vector' ? value.items.find((q) => q.hint)?.hint : undefined);
      const displayList = value.type === 'vector' ? value.items.map((q) => toDisplay(q, context.registry, unit)) : undefined;
      // A matrix item by item, each in its own unit (a target unit for all of them).
      const displayMatrix = value.type === 'matrix' ? { rows: value.rows, cols: value.cols, items: value.items.map((q) => toDisplay(q, context.registry, target)) } : undefined;
      return {
        status: 'ok',
        value,
        ...(display ? { display } : {}),
        ...(displayList ? { displayList } : {}),
        ...(displayMatrix ? { displayMatrix } : {}),
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

/**
 * The value as its line shows it ({decimals=2} or {digits=3} in its unit), for a line that asks
 * the calculation to go on with it ({rounded}). A temperature with a zero point stays exact.
 */
function roundedAsShown(q: Quantity, format: LineFormat, registry: UnitRegistry, target: ResolvedUnit | undefined): Quantity {
  if (q.im || q.absolute || (format.decimals === undefined && format.digits === undefined)) return q;
  const shown = toDisplay(q, registry, target).value;
  if (shown === 0 || !Number.isFinite(shown)) return q;
  const rounded = format.decimals !== undefined ? Number(shown.toFixed(format.decimals)) : Number(shown.toPrecision(format.digits));
  return { ...q, si: (q.si * rounded) / shown };
}

function valueOrNothing(f: () => Value): Value | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}

/**
 * A table written in the sheet as a table of the data layer: a column whose
 * cells are all numbers holds quantities in its unit, any other one text.
 */
function sheetTable(statement: Extract<Statement, { kind: 'table' }>, registry: UnitRegistry, outer: (name: string, span: Span) => Value): TableBuildResult {
  const numeric = (text: string) => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text.replace(/[\s\u00a0]/g, '').replace(',', '.'));
  // A row of totals (a cell Σ) is no row of data: it sums the rows above it.
  const isTotal = (r: readonly string[]) => r.some((cell) => cell.trim() === TABLE_TOTAL);
  const dataRows = statement.rows.filter((r) => !isTotal(r));
  const columns: ColumnSchema[] = statement.columns.map((column, c) => {
    const cells = dataRows.map((r) => (r[c] ?? '').trim()).filter((t) => t !== '');
    const type = column.formula || (cells.length > 0 && cells.every(numeric)) ? 'quantity' : column.unit ? 'quantity' : 'text';
    return { name: column.name, type, ...(column.unit ? { unit: column.unit } : {}) };
  });
  // Numbers are stored with a dot; a comma typed in a cell is a decimal comma.
  const clean = (r: readonly string[]) => r.map((cell, c) => (columns[c]?.type === 'quantity' ? cell.replace(/[\s\u00a0]/g, '').replace(',', '.') : cell));
  const kept = statement.rows.filter((r) => isTotal(r) || r.some((cell) => cell !== ''));
  const built = buildTable({ name: statement.name, columns }, kept.filter((r) => !isTotal(r)).map(clean), registry);
  // The table's own problems point at its line.
  const diagnostics = built.diagnostics.map((d) => ({ ...d, span: statement.span }));
  if (!statement.columns.some((c) => c.formula) && !kept.some(isTotal)) return { table: built.table, diagnostics };

  const rows = built.table.rows.map((r) => [...r]);
  // Calculated columns, left to right: an empty cell gets the formula with the cells of its row.
  for (const [c, column] of statement.columns.entries()) {
    if (!column.formula) continue;
    const unit = built.table.columns[c]?.resolvedUnit;
    for (const [r, row] of rows.entries()) {
      if (row[c] !== null) continue;
      const lookup = (name: string, span: Span): Value => {
        const at = statement.columns.findIndex((col) => col.name === name);
        if (at < 0) return outer(name, span);
        const cell = row[at];
        if (!cell) throw new CalcError(diagnostic('E-TABLE-EMPTY', statement.span, { table: statement.name, column: name, row: String(r + 1) }));
        return cell;
      };
      try {
        const value = evaluate(column.formula, { registry, warnings: [], lookup });
        if (value.type !== 'quantity') throw new CalcError(diagnostic('E-TABLE-FORMULA', statement.span, { table: statement.name, column: column.name, found: typeName(value), unit: column.unit ?? '' }));
        if (unit && !sameDim(value.dim, unit.dim)) throw new CalcError(diagnostic('E-TABLE-FORMULA', statement.span, { table: statement.name, column: column.name, found: baseUnitSymbol(value.dim), unit: column.unit ?? '' }));
        row[c] = unit ? { ...value, hint: unit } : value;
      } catch (err) {
        if (!(err instanceof CalcError) && !(err instanceof DependencyFailed)) throw err;
        if (err instanceof CalcError) diagnostics.push({ ...err.diagnostic, span: statement.span });
        // One report for the column, not one for each row.
        break;
      }
    }
  }
  // Rows of totals: each column with Σ summed over the rows of data since the last row of totals.
  const totals: { after: number; cells: (Value | null)[] }[] = [];
  let after = 0;
  let from = 0;
  for (const raw of kept) {
    if (!isTotal(raw)) {
      after++;
      continue;
    }
    const cells = statement.columns.map((column, c): Value | null => {
      const text = (raw[c] ?? '').trim();
      if (text !== TABLE_TOTAL) return text === '' ? null : { type: 'text', value: text };
      const values = rows.slice(from, after).map((row) => row[c]).filter((v): v is Quantity => v?.type === 'quantity');
      if (values.length === 0) return null;
      if (values.some((v) => !sameDim(v.dim, values[0]!.dim))) return null;
      return { ...values[0]!, si: values.reduce((sum, v) => sum + v.si, 0) };
    });
    totals.push({ after, cells });
    from = after;
  }
  // Calculated cells change with the sheet, not with the text of the table.
  const computed = rows.flatMap((row) => row.map((v) => (v?.type === 'quantity' ? v.si : 0))).join(',');
  const table: Table = { ...built.table, rows, ...(totals.length > 0 ? { totals } : {}), fingerprint: `${built.table.fingerprint}:${computed}` };
  return { table, diagnostics };
}

/**
 * A value in the unit its line asks for (T_K := T | K). An absolute temperature put into kelvin is said to be
 * the thermodynamic one: it goes on as a temperature written in K, so 1/T_K (Arrhenius, a thermistor) gives no warning.
 */
function inTarget(q: Quantity, target: ResolvedUnit): Quantity {
  if (!q.absolute || target.offset !== undefined) return { ...q, hint: target };
  const { absolute: _, ...plain } = q;
  return { ...plain, hint: target };
}

/**
 * A value in kelvins (or °R) named as a temperature is one, counted from absolute zero, as books write
 * T₁ = 298,15 K: T_2 | °C gives 621,3 °C and t − T a difference. A name of a difference (ΔT, delta_T)
 * keeps the value a difference, as ΔT := 50 °C does (docs/03-jazyk.md, 4.4).
 */
function temperatureByName(name: string, q: Quantity): Quantity {
  // A value in a unit of a difference (a correction y_1 in Δ°C, x := ΔT | °C shown in Δ°C) stays one.
  if (q.absolute || q.im || q.hint?.offset !== undefined || q.hint?.symbol.startsWith('Δ') || isDifferenceName(name) || !sameDim(q.dim, dim({ Θ: 1 }))) return q;
  return { ...q, absolute: true };
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
    let left = asComplex(evaluate(expr.left, ctx), expr.left.span);
    let right = asComplex(evaluate(expr.right, ctx), expr.right.span);
    // Both sides shown in one unit: a ratio against "2 %" as 0,43 %, not 0,0043.
    if (sameDim(left.dim, right.dim) && !left.absolute && !right.absolute) {
      if (!left.hint && right.hint) left = { ...left, hint: right.hint };
      else if (left.hint && !right.hint) right = { ...right, hint: left.hint };
    }
    if (left.im || right.im) throw new CalcError(diagnostic('E-COMPLEX-ORDER', expr.span, { operator: expr.operator }));
    const passed = asBoolean(compare(expr.operator, left, right, expr.span), expr.span);
    // "abs(a − b) ≤ tolerance" says two values agree: met or not, a ratio to the tolerance means nothing.
    const agreement = expr.left.kind === 'call' && expr.left.name === 'abs' && expr.left.args[0]?.kind === 'binary' && expr.left.args[0].operator === '-';
    const utilization = agreement ? undefined : utilizationOf(expr.operator, left, right);
    return { ...info, passed, operator: expr.operator, left, right, ...(utilization !== undefined ? { utilization } : {}) };
  }
  return { ...info, passed: asBoolean(evaluate(expr, ctx), expr.span) };
}

function utilizationOf(op: BinaryOperator, left: Quantity, right: Quantity): number | undefined {
  // Ratios of absolute temperatures or of negative values mean nothing.
  if (left.absolute || right.absolute) return undefined;
  if (op === '<' || op === '<=') return left.si >= 0 && right.si > 0 ? left.si / right.si : undefined;
  // "x ≥ 0" has no utilization: the limit must be above zero.
  return right.si > 0 && left.si > 0 ? right.si / left.si : undefined;
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

/** The name the values of a position are read by: Pos1, Pos3a. */
export function positionName(label: string): string {
  return `Pos${label}`;
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
  /** Built-in units plus the sheet's own ones, added as their lines are read. */
  readonly registry: UnitRegistry;
  /** The sheet's own dimensions ("dimension Mena"). */
  readonly dimensions: Set<string>;
  /** Formulas of the names calculated so far, for checking derivations. */
  readonly formulas: Map<string, Expr>;
  /** The relations of the sheet read so far (relation x^2 + y^2 == r^2): the derivations below may follow from them. */
  readonly relations: SheetRelation[];
  /** Every formula of the sheet by its name (P, #Integral1 for {eq=Integral1}), wherever it stands. */
  namedFormulas?: ReadonlyMap<string, { readonly expr: Expr; readonly text: string }>;
}

/** Base dimensions of SI: a sheet's own dimension cannot take their names. */
const SI_DIMENSIONS: ReadonlySet<string> = new Set(['M', 'L', 'T', 'I', 'Θ', 'N', 'J']);

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

/** The names a table of variants defines: its columns but the first, which names the variants. */
function variantNames(statement: Statement): string[] {
  return statement.kind === 'table' && statement.format?.variants !== undefined ? statement.columns.slice(1).map((c) => c.name) : [];
}

/** The names a statement defines. */
function definedNames(statement: Statement): string[] {
  if (statement.kind === 'definition' || statement.kind === 'invalid') return statement.name !== undefined ? [statement.name] : [];
  if (statement.kind === 'table') return [statement.name, ...variantNames(statement)];
  if (statement.kind === 'solve') return statement.unknowns.map((u) => u.name);
  return [];
}

function within(inner: Span, outer: Span): boolean {
  return inner.offset >= outer.offset && inner.offset <= outer.offset + outer.length;
}

/** The equation of a relation as one expression: left == right. */
function relationExpr(statement: Extract<Statement, { kind: 'derive' }>): Expr {
  const [left, right] = statement.members;
  return { kind: 'binary', operator: '==', left: left!, right: right!, span: statement.span };
}

/** Whether a name stands in a text as a word of its own (Kruh in "solve y: Kruh", not in "Kruhy"). */
function wordIn(text: string, name: string): boolean {
  let at = text.indexOf(name);
  const part = /[\p{L}\p{N}_]/u;
  while (at >= 0) {
    if (!part.test(text[at - 1] ?? ' ') && !part.test(text[at + name.length] ?? ' ')) return true;
    at = text.indexOf(name, at + 1);
  }
  return false;
}
