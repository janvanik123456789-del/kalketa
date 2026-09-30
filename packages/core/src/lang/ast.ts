/**
 * Abstract syntax tree of a sheet.
 */

import type { Span } from '../diagnostics.js';

// ---------------------------------------------------------------------------
// Unit expressions (the "kN/m" in "12 kN/m")
// ---------------------------------------------------------------------------

export type UnitExpr =
  | { readonly kind: 'unit-name'; readonly name: string; readonly span: Span }
  | { readonly kind: 'unit-one'; readonly span: Span }
  | { readonly kind: 'unit-mul' | 'unit-div'; readonly left: UnitExpr; readonly right: UnitExpr; readonly span: Span }
  | { readonly kind: 'unit-pow'; readonly base: UnitExpr; readonly exponent: number; readonly span: Span };

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '^'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | 'and' | 'or';

export type Expr =
  | { readonly kind: 'number'; readonly value: number; readonly unit?: UnitExpr; readonly span: Span; readonly imaginary?: boolean }
  | { readonly kind: 'string'; readonly value: string; readonly span: Span }
  /** A date: 2026-09-29, as days from 1970-01-01. */
  | { readonly kind: 'date'; readonly days: number; readonly span: Span }
  | { readonly kind: 'boolean'; readonly value: boolean; readonly span: Span }
  | { readonly kind: 'variable'; readonly name: string; readonly span: Span }
  | { readonly kind: 'unit'; readonly unit: UnitExpr; readonly span: Span }
  | { readonly kind: 'unary'; readonly operator: '-' | '+' | 'not'; readonly operand: Expr; readonly span: Span }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: Expr; readonly right: Expr; readonly span: Span }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Expr[]; readonly named: readonly NamedArg[]; readonly span: Span }
  | { readonly kind: 'member'; readonly object: Expr; readonly name: string; readonly span: Span }
  /** A series: [100, 120, 150] (a series inside is spread: [−I, savings]). */
  | { readonly kind: 'vector'; readonly items: readonly Expr[]; readonly span: Span }
  /** An item of a series, counted from 1: CF[1]. */
  | { readonly kind: 'index'; readonly object: Expr; readonly index: Expr; readonly span: Span };

/** One equation of a solve statement: left == right. */
export interface Equation {
  readonly left: Expr;
  readonly right: Expr;
  readonly span: Span;
}

/** Parameter of a user function. */
export interface Param {
  readonly name: string;
  readonly span: Span;
}

/** Named call argument: "by: G" in find_min(T, by: G). */
export interface NamedArg {
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: Expr;
}

// ---------------------------------------------------------------------------
// Statements (one per logical line)
// ---------------------------------------------------------------------------

interface StatementBase {
  readonly span: Span;
  /** Trailing ' comment on the same line. */
  readonly comment?: string;
}

export type Statement =
  | (StatementBase & { readonly kind: 'heading'; readonly level: number; readonly text: string })
  | (StatementBase & { readonly kind: 'text'; readonly text: string })
  /** A picture: ![caption](path){width=60%}; the width is a share of the text width. */
  | (StatementBase & { readonly kind: 'picture'; readonly caption: string; readonly path: string; readonly width?: number })
  | (StatementBase & { readonly kind: 'comment' })
  | (StatementBase & { readonly kind: 'directive'; readonly name: string; readonly args: string })
  | (StatementBase & {
      readonly kind: 'definition';
      readonly name: string;
      readonly nameSpan: Span;
      readonly expr: Expr;
      readonly target?: UnitExpr;
      /** Parameters of a user function: A_kruh(d) := π·d²/4. */
      readonly params?: readonly Param[];
      /** An input of a block ("input L := 5 m"): a call of the block may give another value. */
      readonly input?: boolean;
    })
  | (StatementBase & { readonly kind: 'display'; readonly expr: Expr; readonly target?: UnitExpr })
  | (StatementBase & {
      readonly kind: 'check';
      /** "Ohyb" in: check "Ohyb": σ ≤ f_y source "EN 1993-1-1, 6.2.5" */
      readonly label?: string;
      readonly expr: Expr;
      readonly source?: string;
    })
  | (StatementBase & { readonly kind: 'dimension'; readonly name: string; readonly nameSpan: Span })
  | (StatementBase & {
      readonly kind: 'unit';
      readonly name: string;
      readonly nameSpan: Span;
      /** "unit CZK: Mena": base unit of a dimension; "dimensionless" (or 1) for counts like ks. */
      readonly dimension?: { readonly name: string; readonly span: Span };
      /** "unit EUR := 25 CZK": a unit defined by a value. */
      readonly expr?: Expr;
    })
  | (StatementBase & {
      readonly kind: 'solve';
      /** The names the statement finds and defines. */
      readonly unknowns: readonly Param[];
      readonly equations: readonly Equation[];
      /** "in 0 .. 10": interval of a single unknown. */
      readonly range?: { readonly low: Expr; readonly high: Expr };
      /** "guess I_1 = 1 A": first guesses, which also give the unknowns their units. */
      readonly guesses: readonly NamedArg[];
    })
  | (StatementBase & { readonly kind: 'invalid'; /** Name if the line looked like a definition. */ readonly name?: string });

export interface Sheet {
  readonly statements: readonly Statement[];
}
