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
  /** A derivative of a function written as in a book: w″ (in its equation), w′(0 m) (at a point). */
  | { readonly kind: 'prime'; readonly name: string; readonly order: number; readonly arg?: Expr; readonly span: Span }
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
  /** A matrix, rows separated by |: [4, -2 | -2, 4]. */
  | { readonly kind: 'matrix'; readonly rows: readonly (readonly Expr[])[]; readonly span: Span }
  /** From .. to: the interval of a bound variable, integral(f(x), x: 0 m .. L). */
  | { readonly kind: 'range'; readonly low: Expr; readonly high: Expr; readonly span: Span }
  /** An item of a series, counted from 1: CF[1]. */
  | { readonly kind: 'index'; readonly object: Expr; readonly index: Expr; /** The column of a matrix item: A[i, j]. */ readonly column?: Expr; readonly span: Span };

/** One equation of a solve statement: left == right, or an inequality left ≤ right. */
export interface Equation {
  readonly left: Expr;
  readonly right: Expr;
  /** An inequality (one unknown only): solved for its bound, then on which side the solutions lie. */
  readonly relation?: Inequality;
  readonly span: Span;
}

export type Inequality = '<' | '<=' | '>' | '>=';

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
  /** How the line is shown, {decimals=2} at its end: never how it is calculated. */
  readonly format?: LineFormat;
}

/** Shown with so many places after the decimal sign, or so many significant digits. */
export interface LineFormat {
  readonly decimals?: number;
  readonly digits?: number;
  /** Of a text line: size in points, the font family, italic, bold. */
  readonly size?: number;
  readonly font?: TextFont;
  readonly italic?: boolean;
  readonly bold?: boolean;
  readonly align?: TextAlign;
  readonly color?: TextColor;
  /** The rows below calculate with the value as shown ({decimals=2 rounded}), not the exact one. */
  readonly rounded?: boolean;
  /** The equation number of the line: {eq} numbered, {eq=hooke} numbered and named for (#hooke) in text, {noeq} never. */
  readonly eq?: true | string;
  readonly noeq?: boolean;
  /**
   * A heading that starts a position of the calculation ({pos}, numbered on, or {pos=3a}):
   * the names defined in it hold until the next position, and after it as Pos1.A.
   */
  readonly pos?: true | string;
  /** A cell beside the line above it, on one row of the page: "Zatěžující síla" | F = 1600 N. */
  readonly beside?: boolean;
}

/**
 * A font of text: by kind (each machine has one of the kind), or a font of the system by
 * its name with _ for a space (font=Times_New_Roman), its kind standing in where it is missing.
 */
export type TextFont = 'serif' | 'sans' | 'mono' | (string & {});
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
/** Colors by name, few and print-safe: what a calculation needs to mark, not a palette. */
/** A colour of text: a named one, dark enough for black-and-white print, or any as #rrggbb. */
export type TextColor = 'gray' | 'blue' | 'red' | 'green' | (string & {});
export const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right', 'justify'];
export const TEXT_COLORS: readonly TextColor[] = ['gray', 'blue', 'red', 'green'];

export type Statement =
  | (StatementBase & { readonly kind: 'heading'; readonly level: number; readonly text: string })
  /** cites: the sources the text comes from, "…" [ST:T1]. */
  | (StatementBase & { readonly kind: 'text'; readonly text: string; readonly cites?: readonly string[] })
  /** A picture: ![caption](path){width=60%}; the width is a share of the text width. */
  | (StatementBase & { readonly kind: 'picture'; readonly caption: string; readonly path: string; readonly width?: number; readonly side?: 'left' | 'right'; readonly wrap?: 'left' | 'right'; readonly align?: 'left' | 'right'; readonly dx?: number; readonly dy?: number; readonly noWrap?: boolean })
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
      /**
       * A derivation ending in the definition: y := a == b == c. Every member,
       * the last one is also `expr`; each step is checked to hold.
       */
      readonly derivation?: readonly Expr[];
      /** Steps of the derivation equal when rounded (≐): step i joins members i and i + 1. */
      readonly approx?: readonly number[];
      /** After derive: a symbol of theory; names without a value are no error. */
      readonly symbolic?: boolean;
      /** Where the formula or the value comes from: M_Ed := … source "EN 1990, 6.10". */
      readonly source?: string;
    })
  /**
   * A table written in the sheet (measured points…):
   *   table Mereni:
   *       | t [s] | T [°C] {0.0} |
   *       | 0     | 20.1         |
   */
  | (StatementBase & { readonly kind: 'table'; readonly name: string; readonly nameSpan: Span; readonly columns: readonly SheetColumn[]; readonly rows: readonly (readonly string[])[] })
  /** A derivation on its own (theory): derive a == b == c; every step is checked to hold. */
  | (StatementBase & { readonly kind: 'derive'; readonly members: readonly Expr[]; readonly approx?: readonly number[] })
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
      /** solve w(x): a differential equation; the unknown is a function of this variable. */
      readonly ode?: { readonly variable: string; readonly span: Span };
      readonly equations: readonly Equation[];
      /** "in 0 .. 10": interval of a single unknown. */
      readonly range?: { readonly low: Expr; readonly high: Expr };
      /** "guess I_1 = 1 A": first guesses, which also give the unknowns their units. */
      readonly guesses: readonly NamedArg[];
    })
  | (StatementBase & { readonly kind: 'invalid'; /** Name if the line looked like a definition. */ readonly name?: string });

/** A column of a table in the sheet: its name, unit and format of its numbers ("0.0"). */
export interface SheetColumn {
  readonly name: string;
  readonly unit?: string;
  readonly format?: string;
  /** "g_d [kN/m²] = g_k·γ_G": its empty cells are calculated, row by row, from the columns and the sheet. */
  readonly formula?: Expr;
}

/** A cell of a sheet table that sums its column over the rows above it (back to the last such row). */
export const TABLE_TOTAL = 'Σ';

export interface Sheet {
  readonly statements: readonly Statement[];
}
