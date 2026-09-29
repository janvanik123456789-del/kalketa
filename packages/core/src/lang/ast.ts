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
  | { readonly kind: 'number'; readonly value: number; readonly unit?: UnitExpr; readonly span: Span }
  | { readonly kind: 'string'; readonly value: string; readonly span: Span }
  | { readonly kind: 'boolean'; readonly value: boolean; readonly span: Span }
  | { readonly kind: 'variable'; readonly name: string; readonly span: Span }
  | { readonly kind: 'unit'; readonly unit: UnitExpr; readonly span: Span }
  | { readonly kind: 'unary'; readonly operator: '-' | '+' | 'not'; readonly operand: Expr; readonly span: Span }
  | { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: Expr; readonly right: Expr; readonly span: Span }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Expr[]; readonly named: readonly NamedArg[]; readonly span: Span }
  | { readonly kind: 'member'; readonly object: Expr; readonly name: string; readonly span: Span };

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
  | (StatementBase & { readonly kind: 'comment' })
  | (StatementBase & { readonly kind: 'directive'; readonly name: string; readonly args: string })
  | (StatementBase & {
      readonly kind: 'definition';
      readonly name: string;
      readonly nameSpan: Span;
      readonly expr: Expr;
      readonly target?: UnitExpr;
    })
  | (StatementBase & { readonly kind: 'display'; readonly expr: Expr; readonly target?: UnitExpr })
  | (StatementBase & { readonly kind: 'invalid'; /** Name if the line looked like a definition. */ readonly name?: string });

export interface Sheet {
  readonly statements: readonly Statement[];
}
