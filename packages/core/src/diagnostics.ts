/**
 * Diagnostics: errors, warnings and infos reported by the core.
 *
 * The core never produces human-readable text. It reports a code plus
 * parameters; the i18n layer turns them into a message in the user's language.
 */

export type Severity = 'error' | 'warning' | 'info';

/** Location in the source. Lines and columns are 1-based; `offset` is 0-based. */
export interface Span {
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export type DiagnosticParams = Readonly<Record<string, string | number>>;

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: Severity;
  readonly span: Span;
  readonly params: DiagnosticParams;
}

export const DIAGNOSTIC_SEVERITY = {
  // Lexing and parsing
  'E-UNEXPECTED-CHAR': 'error',
  'E-UNTERMINATED-STRING': 'error',
  'E-SYNTAX': 'error',
  'E-PICTURE-SYNTAX': 'error',
  'E-MISSING-OPERATOR': 'error',
  'E-ASSIGN-WITH-EQUALS': 'error',
  'E-UNSUPPORTED': 'error',
  'W-AMBIGUOUS-UNIT': 'warning',

  // Names
  'E-UNDEFINED': 'error',
  'E-DEFINED-LATER': 'error',
  'E-REDEFINED': 'error',
  'E-RESERVED': 'error',
  'I-DEPENDENCY-FAILED': 'info',

  // Units and values
  'E-UNKNOWN-UNIT': 'error',
  'E-UNIT-MISMATCH': 'error',
  'E-TARGET-UNIT': 'error',
  'E-ABS-TEMP': 'error',
  'W-ABS-TEMP-MUL': 'warning',
  'E-POWER-DIM': 'error',
  'E-TYPE': 'error',
  'E-DIV-ZERO': 'error',
  'E-NOT-FINITE': 'error',
  'E-COMPLEX-ARG': 'error',
  'E-COMPLEX-ORDER': 'error',
  'E-INDEX': 'error',
  'E-DATE-INVALID': 'error',
  'E-DATE-ARITHMETIC': 'error',
  'E-VECTOR-LENGTH': 'error',
  'E-RANGE-SIZE': 'error',
  'E-NO-PAYBACK': 'error',

  // Functions
  'E-FUNC-UNKNOWN': 'error',
  'E-FUNC-ARITY': 'error',
  'E-FUNC-ARG-DIM': 'error',
  'E-DOMAIN': 'error',
  'E-NAMED-ARG': 'error',
  'E-CALCULUS-FORM': 'error',
  'E-MATRIX-SHAPE': 'error',
  'E-MATRIX-SQUARE': 'error',
  'E-MATRIX-UNITS': 'error',
  'E-MATRIX-SINGULAR': 'error',
  'E-MATRIX-SYMMETRIC': 'error',
  'E-RANGE-PLACE': 'error',
  'W-CALCULUS-ACCURACY': 'warning',
  'E-PLOT-FORM': 'error',
  'E-PLOT-PLACE': 'error',
  'E-PLOT-UNITS': 'error',
  'E-PLOT-SERIES': 'error',
  'E-PLOT-KIND': 'error',
  'E-PLOT-RANGE': 'error',
  'E-PLOT-SAMPLES': 'error',
  'E-PLOT-POSITION': 'error',
  'E-DERIVE-STEP': 'error',
  'E-DERIVE-UNITS': 'error',
  'W-DERIVE-UNVERIFIED': 'warning',
  'E-NO-BOUNDS': 'error',
  'E-SOLVE-ROOTS': 'error',
  'E-ROOTS-POLYNOMIAL': 'error',
  'E-PLOT-LENGTH': 'error',
  'E-NOT-FUNCTION': 'error',
  'E-RECURSION': 'error',

  // Solver
  'E-SOLVE-COUNT': 'error',
  'E-SOLVE-NO-ROOT': 'error',
  'E-SOLVE-NO-CONVERGENCE': 'error',
  'E-SOLVE-SINGULAR': 'error',

  // Blocks
  'E-BLOCK-INPUT': 'error',
  'E-BLOCK-ERROR': 'error',
  'E-BLOCK-OUTPUT': 'error',

  // Tables
  'E-TABLE-SCHEMA': 'error',
  'E-TABLE-CELL': 'error',
  'W-TABLE-UNIT': 'warning',
  'E-TABLE-KEY': 'error',
  'E-TABLE-COLUMN': 'error',
  'E-TABLE-EMPTY': 'error',
  'E-TABLE-NO-MATCH': 'error',
  'E-TABLE-INTERPOLATE': 'error',
  'W-EXTRAPOLATION': 'warning',
  'W-TABLE-ROWS-SKIPPED': 'warning',

  // Sheet files
  'E-FILE-INVALID': 'error',
  'E-FILE-VERSION': 'error',
  'W-FILE-HASH': 'warning',
  'W-REVISION-HASH': 'warning',
} as const satisfies Record<string, Severity>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_SEVERITY;

export function diagnostic(code: DiagnosticCode, span: Span, params: DiagnosticParams = {}): Diagnostic {
  return { code, severity: DIAGNOSTIC_SEVERITY[code], span, params };
}

/** Thrown inside the core to abort evaluation of one statement. */
export class CalcError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.code);
    this.name = 'CalcError';
  }
}

export function fail(code: DiagnosticCode, span: Span, params: DiagnosticParams = {}): never {
  throw new CalcError(diagnostic(code, span, params));
}
