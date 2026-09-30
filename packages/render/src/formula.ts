/**
 * Expression -> math layout, either symbolic ("q·L²/8") or with values
 * substituted ("12 kN/m · (5 m)² / 8").
 *
 * The parser drops the user's parentheses, so they are put back from operator
 * precedence. Division is set as a fraction, which needs no parentheses.
 */

import type { BinaryOperator, Expr, UnitExpr } from '@calccanvas/core';
import { formatUnit } from '@calccanvas/core';
import { frac, mi, mn, mo, mtext, mu, nameNode, paren, row, sqrt, sub, sup, type MathNode } from './math.js';

export interface FormulaOptions {
  /** Formats a number literal written in the sheet (full precision, locale separators). */
  readonly literal: (value: number) => string;
  /** Separator of function arguments: "," or ";" when the decimal separator is ",". */
  readonly argumentSeparator: string;
  readonly booleans: { readonly true: string; readonly false: string };
  /** Value to print instead of a variable or column; undefined keeps the symbol. */
  readonly substitute?: (expr: Expr) => Substituted | undefined;
  /** Names set as plain text, not as math symbols: blocks ("Prosty_nosnik" as "Prosty nosnik"). */
  readonly textNames?: ReadonlySet<string>;
  /** Variables holding the result of a block: N1.M_max is printed as M_max(N1). */
  readonly recordNames?: ReadonlySet<string>;
}

export interface Substituted {
  readonly node: MathNode;
  /** A negative number or a number with a unit needs parentheses in some places. */
  readonly negative: boolean;
  readonly hasUnit: boolean;
}

interface Rendered {
  readonly node: MathNode;
  /** Binding strength: higher binds tighter. */
  readonly prec: number;
  readonly negative?: boolean;
}

const ATOM = 10;
const OPERATOR_TEXT: Readonly<Record<string, string>> = {
  '+': '+', '-': '−', '*': '·', '==': '=', '!=': '≠', '<': '<', '<=': '≤', '>': '>', '>=': '≥', and: '∧', or: '∨',
};
const PRECEDENCE: Readonly<Record<BinaryOperator, number>> = {
  or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': ATOM, '^': 7,
};

/** Thin space between a number and its unit. */
export const THIN_SPACE = mtext(' ');

export function formulaNode(expr: Expr, options: FormulaOptions): MathNode {
  return render(expr, options).node;
}

/** True when substitution would print something different from the formula. */
export function hasSubstitutableParts(expr: Expr): boolean {
  switch (expr.kind) {
    case 'variable':
    case 'member':
      return true;
    case 'unary':
      return hasSubstitutableParts(expr.operand);
    case 'binary':
      return hasSubstitutableParts(expr.left) || hasSubstitutableParts(expr.right);
    case 'call':
      return expr.args.some(hasSubstitutableParts);
    case 'vector':
      return expr.items.some(hasSubstitutableParts);
    default:
      return false;
  }
}

function render(expr: Expr, o: FormulaOptions): Rendered {
  if (expr.kind === 'variable' || expr.kind === 'member') {
    const value = o.substitute?.(expr);
    if (value) return { node: value.node, prec: value.negative ? 3.5 : value.hasUnit ? 6 : ATOM, negative: value.negative };
  }

  switch (expr.kind) {
    case 'number': {
      const n = expr.imaginary ? row(mn(o.literal(expr.value)), mi('j')) : mn(o.literal(expr.value));
      return { node: expr.unit ? row(n, THIN_SPACE, mu(formatUnit(expr.unit))) : n, prec: expr.unit ? 6 : ATOM };
    }
    case 'unit':
      return { node: mu(unitText(expr.unit)), prec: ATOM };
    case 'string':
      return { node: mtext(`"${expr.value}"`), prec: ATOM };
    case 'boolean':
      return { node: mtext(expr.value ? o.booleans.true : o.booleans.false), prec: ATOM };
    case 'variable':
      return { node: expr.name === 'π' ? mi('π') : nameNode(expr.name), prec: ATOM };
    case 'member':
      // The value of a block names its use: N1.M_max -> M_max(N1).
      if (expr.object.kind === 'variable' && o.recordNames?.has(expr.object.name)) {
        return { node: row(nameNode(expr.name), paren(nameNode(expr.object.name))), prec: ATOM };
      }
      // Printed as the column name: profil.W_y -> W_y.
      return { node: nameNode(expr.name), prec: ATOM };
    case 'unary': {
      const operand = render(expr.operand, o);
      if (expr.operator === '+') return operand;
      const symbol = expr.operator === 'not' ? '¬' : '−';
      return { node: row(mo(symbol), wrap(operand, operand.prec <= 5)), prec: 6, negative: true };
    }
    case 'binary':
      // A unit after a group reads like a unit after a number: "(3 + 4j) Ω".
      if (expr.operator === '*' && expr.right.kind === 'unit') {
        const group = render(expr.left, o);
        return { node: row(paren(group.node), THIN_SPACE, render(expr.right, o).node), prec: 6 };
      }
      return renderBinary(expr.operator, render(expr.left, o), render(expr.right, o));
    case 'call':
      return renderCall(expr, o);
    case 'vector': {
      const parts: MathNode[] = [];
      expr.items.forEach((item, i) => {
        if (i > 0) parts.push(mo(o.argumentSeparator));
        parts.push(render(item, o).node);
      });
      return { node: row(mo('['), ...parts, mo(']')), prec: ATOM };
    }
    case 'index': {
      // CF[1] is written CF₁.
      const object = render(expr.object, o);
      const index = render(expr.index, o).node;
      return { node: expr.object.kind === 'variable' ? sub(object.node, index) : row(wrap(object, object.prec < ATOM), mo('['), index, mo(']')), prec: ATOM };
    }
  }
}

function renderBinary(op: BinaryOperator, left: Rendered, right: Rendered): Rendered {
  const prec = PRECEDENCE[op];
  switch (op) {
    case '/':
      return { node: frac(left.node, right.node), prec: ATOM };
    case '^':
      return { node: sup(wrap(left, left.prec < ATOM), right.node), prec };
    case '*':
      return { node: row(wrap(left, left.prec < prec), mo('·'), wrap(right, right.prec < prec || !!right.negative)), prec };
    case '+':
    case '-':
      return { node: row(wrap(left, left.prec < prec), mo(OPERATOR_TEXT[op]!), wrap(right, right.prec < prec || (op === '-' && right.prec === prec) || !!right.negative)), prec };
    default:
      return { node: row(wrap(left, left.prec <= prec), mo(OPERATOR_TEXT[op]!), wrap(right, right.prec <= prec)), prec };
  }
}

function renderCall(expr: Extract<Expr, { kind: 'call' }>, o: FormulaOptions): Rendered {
  const args = expr.args.map((a) => render(a, o).node);
  if (expr.name === 'sqrt' && args.length === 1) return { node: sqrt(args[0]!), prec: ATOM };
  if (expr.name === 'abs' && args.length === 1) return { node: row(mo('|'), args[0]!, mo('|')), prec: ATOM };
  const parts: MathNode[] = [];
  args.forEach((a, i) => {
    if (i > 0) parts.push(mo(o.argumentSeparator));
    parts.push(a);
  });
  for (const named of expr.named) {
    if (parts.length > 0) parts.push(mo(o.argumentSeparator));
    parts.push(mtext(`${named.name}: `), render(named.value, o).node);
  }
  const name = o.textNames?.has(expr.name)
    ? mtext(expr.name.replaceAll('_', ' '))
    : expr.name.includes('_')
      ? sub(mi(expr.name.split('_')[0]!, true), mi(expr.name.split('_').slice(1).join(','), true))
      : mi(expr.name, true);
  return { node: row(name, paren(row(...parts))), prec: ATOM };
}

function wrap(r: Rendered, needed: boolean): MathNode {
  return needed ? paren(r.node) : r.node;
}

function unitText(unit: UnitExpr): string {
  return formatUnit(unit);
}
