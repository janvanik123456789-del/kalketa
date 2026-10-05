/**
 * Expression -> math layout, either symbolic ("q·L²/8") or with values
 * substituted ("12 kN/m · (5 m)² / 8").
 *
 * The parser drops the user's parentheses, so they are put back from operator
 * precedence. Division is set as a fraction, which needs no parentheses.
 */

import type { BinaryOperator, Expr, UnitExpr } from '@kalketa/core';
import { formatUnit } from '@kalketa/core';
import { frac, mi, mn, mo, mtext, mu, nameNode, nroot, paren, row, sqrt, sub, sup, type MathNode, subsup, underover, table } from './math.js';

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
  /** Formats a date literal: "29. 9. 2026"; ISO when absent. */
  readonly date?: (days: number) => string;
  /** Column names read from more than one row in this formula: printed with their row. */
  readonly qualifiedMembers?: ReadonlySet<string>;
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
  // A column name read from two different rows (stridac.cena + kabel.cena) is
  // printed with its row, cena(stridac), so the two can be told apart.
  const clashing = clashingMembers(expr);
  return render(expr, clashing.size > 0 ? { ...options, qualifiedMembers: clashing } : options).node;
}

function clashingMembers(expr: Expr): Set<string> {
  const objects = new Map<string, Set<string>>();
  const visit = (e: Expr): void => {
    switch (e.kind) {
      case 'member':
        if (e.object.kind === 'variable') {
          const set = objects.get(e.name) ?? new Set<string>();
          set.add(e.object.name);
          objects.set(e.name, set);
        }
        return visit(e.object);
      case 'unary':
        return visit(e.operand);
      case 'binary':
        visit(e.left);
        return visit(e.right);
      case 'call':
        e.args.forEach(visit);
        e.named.forEach((n) => visit(n.value));
        return;
      case 'vector':
        return e.items.forEach(visit);
      case 'matrix':
        return e.rows.forEach((r) => r.forEach(visit));
      case 'index':
        visit(e.object);
        return visit(e.index);
      default:
        return;
    }
  };
  visit(expr);
  return new Set([...objects].filter(([, set]) => set.size > 1).map(([name]) => name));
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
      return expr.args.some(hasSubstitutableParts) || expr.named.some((n) => hasSubstitutableParts(n.value));
    case 'range':
      return hasSubstitutableParts(expr.low) || hasSubstitutableParts(expr.high);
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
    case 'date':
      return { node: mtext(o.date ? o.date(expr.days) : new Date(expr.days * 86_400_000).toISOString().slice(0, 10)), prec: ATOM };
    case 'boolean':
      return { node: mtext(expr.value ? o.booleans.true : o.booleans.false), prec: ATOM };
    case 'variable':
      // Constants are upright (ISO 80000-2): π, not the italic 𝜋.
      return { node: expr.name === 'π' ? mi('π', true) : nameNode(expr.name), prec: ATOM };
    case 'member':
      // The value of a block names its use: N1.M_max -> M_max(N1).
      if (expr.object.kind === 'variable' && (o.recordNames?.has(expr.object.name) || o.qualifiedMembers?.has(expr.name))) {
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
        // "(3 + 4j) Ω"; a single name or number needs no parentheses: "kurz CZK".
        const group = render(expr.left, o);
        return { node: row(group.prec >= ATOM ? group.node : paren(group.node), THIN_SPACE, render(expr.right, o).node), prec: 6 };
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
    case 'range':
      return { node: row(render(expr.low, o).node, mo('…'), render(expr.high, o).node), prec: ATOM };
    case 'matrix':
      return { node: row(mo('['), table(expr.rows.map((r) => r.map((item) => render(item, o).node))), mo(']')), prec: ATOM };
    case 'index': {
      // CF[1] is written CF₁.
      const object = render(expr.object, o);
      const index = expr.column ? row(render(expr.index, o).node, mo(','), render(expr.column, o).node) : render(expr.index, o).node;
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
  const calculus = renderCalculus(expr, o);
  if (calculus) return calculus;
  const args = expr.args.map((a) => render(a, o).node);
  if (expr.name === 'sqrt' && args.length === 1) return { node: sqrt(args[0]!), prec: ATOM };
  if (expr.name === 'cbrt' && args.length === 1) return { node: nroot(args[0]!, mn('3')), prec: ATOM };
  if (expr.name === 'root' && args.length === 2 && expr.named.length === 0) return { node: nroot(args[0]!, args[1]!), prec: ATOM };
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

/**
 * integral(f, x: a .. b) as ∫ₐᵇ f dx, derivative(f, x: a) as d/dx f at x = a,
 * sum(f, k: 1 .. n) as Σ. The variable stays a symbol when values are put in.
 */
function renderCalculus(expr: Extract<Expr, { kind: 'call' }>, o: FormulaOptions): Rendered | undefined {
  const unbounded = renderUnbounded(expr, o);
  if (unbounded) return unbounded;
  if (!['integral', 'derivative', 'sum'].includes(expr.name) || expr.args.length !== 1) return undefined;
  const variable = expr.named.find((n) => n.name !== 'order');
  if (!variable) return undefined;
  const inner: FormulaOptions = { ...o, substitute: (e) => (e.kind === 'variable' && e.name === variable.name ? undefined : o.substitute?.(e)) };
  const body = render(expr.args[0]!, inner);
  const x = nameNode(variable.name);
  const d = mi('d', true);
  if (expr.name === 'derivative') {
    if (variable.value.kind === 'range') return undefined;
    const second = expr.named.some((n) => n.name === 'order' && n.value.kind === 'number' && n.value.value === 2);
    const operator = second ? frac(sup(d, mn('2')), row(d, sup(x, mn('2')))) : frac(d, row(d, x));
    // The point: d/dx f |x = a.
    const at = sub(mo('|'), row(x, mo('='), render(variable.value, o).node));
    return { node: row(operator, wrap(body, body.prec < 5), at), prec: 5 };
  }
  if (variable.value.kind !== 'range') return undefined;
  const low = render(variable.value.low, o).node;
  const high = render(variable.value.high, o).node;
  if (expr.name === 'integral') return { node: row(subsup(mo('∫'), low, high), wrap(body, body.prec < 5), THIN_SPACE, d, x), prec: 5 };
  return { node: row(underover(mo('∑'), row(x, mo('='), low), high), wrap(body, body.prec < 5)), prec: 5 };
}

/**
 * Σ and ∫ of theory, without bounds: sum(ΔS·y^2) as Σ ΔS·y² (also the sum of a
 * series), sum(F_i·a_i, i) as Σᵢ F_i·a_i, integral(y^2, dS) as ∫ y² dS.
 */
function renderUnbounded(expr: Extract<Expr, { kind: 'call' }>, o: FormulaOptions): Rendered | undefined {
  if (expr.named.length > 0 || (expr.name !== 'sum' && expr.name !== 'integral')) return undefined;
  if (expr.name === 'sum' && expr.args.length === 1) {
    const body = render(expr.args[0]!, o);
    return { node: row(mo('∑'), wrap(body, body.prec < 5)), prec: 5 };
  }
  if (expr.args.length !== 2) return undefined;
  const by = expr.args[1]!;
  const name = by.kind === 'variable' ? by.name : by.kind === 'unit' && by.unit.kind === 'unit-name' ? by.unit.name : undefined;
  if (!name) return undefined;
  const body = render(expr.args[0]!, o);
  if (expr.name === 'sum') return { node: row(underover(mo('∑'), nameNode(name), row()), wrap(body, body.prec < 5)), prec: 5 };
  // dS is d and S; a name without the d (integral(f, x)) gets one.
  const variable = name.length > 1 && name.startsWith('d') ? name.slice(1) : name;
  return { node: row(mo('∫'), wrap(body, body.prec < 5), THIN_SPACE, mi('d', true), nameNode(variable)), prec: 5 };
}

function wrap(r: Rendered, needed: boolean): MathNode {
  return needed ? paren(r.node) : r.node;
}

function unitText(unit: UnitExpr): string {
  return formatUnit(unit);
}
