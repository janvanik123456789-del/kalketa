/**
 * @kalketa/core — the calculation engine.
 *
 * Rules (docs/02-architektura.md, ch. 2):
 *  - no dependencies on other packages of the project,
 *  - no file system or network access (deterministic),
 *  - no knowledge of any particular field of engineering.
 */

export const CORE_VERSION = '0.1.0';

export * from './diagnostics.js';
export type * from './lang/ast.js';
export type { Root, RootsFound } from './eval/solver.js';
export { DOMAIN_SPELLINGS, TABLE_TOTAL, TEXT_ALIGNS, TEXT_COLORS } from './lang/ast.js';
export { tokenize, type Token, type TokenType, type LexOptions } from './lang/lexer.js';
export { formatExpr } from './lang/format.js';
export { formatPicture, formatPlacement, parse, parsePicture, parsePlacement, type ParseOptions, type ParseResult, type PictureLine, type Placement } from './lang/parser.js';
export * from './units/dimension.js';
export { UnitRegistry, defaultRegistry, canonicalUnitSymbol, type UnitDef } from './units/registry.js';
export { blockVersion, type BlockSource } from './eval/blocks.js';
export { civilFromDays, DATE_UNIT, parseDate } from './values/date.js';
export { resolveUnit, formatUnit, type ResolvedUnit } from './units/unitExpr.js';
export { toDisplay, inUnit, baseUnitSymbol, type DisplayValue } from './units/display.js';
export * from './values/value.js';
export { evaluate, LINE_TIME_LIMIT_MS, withTimeLimit, type EvalContext } from './eval/evaluator.js';
export { FUNCTION_NAMES, BUILTIN_CONSTANTS, builtinFunctions } from './eval/functions.js';
export { FUNCTION_MODULES, FunctionRegistry, signature, type FunctionDef, type FunctionModuleId } from './functions/registry.js';
export * from './graph/session.js';
export * from './graph/compare.js';
export { isPlotCall, MAX_PLOT_SERIES, type PlotKind, type PlotResult, type PlotSeries, type PlotSurface } from './eval/plot.js';
export * from './tables/table.js';
export { TABLE_FUNCTIONS, ROW_VARIABLE } from './eval/tables.js';
export * from './provenance/trace.js';
export { toDecimalComma, fromDecimalComma } from './lang/notation.js';
