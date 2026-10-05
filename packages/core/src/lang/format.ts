/**
 * An expression written back as a line of the sheet (file notation): the
 * formula the solver expressed becomes "L := sqrt(8·M_Ed/q)". Brackets only
 * where the priorities of the operators need them.
 */

import type { Expr } from './ast.js';
import { formatUnit } from '../units/unitExpr.js';

const PRIORITY: Readonly<Record<string, number>> = {
  or: 1,
  and: 2,
  '==': 4,
  '!=': 4,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  unary: 7,
  '^': 8,
};
const ATOM = 9;
const SIGN: Readonly<Record<string, string>> = { '*': '·', '<=': '≤', '>=': '≥', '!=': '≠' };

export function formatExpr(expr: Expr): string {
  return written(expr).text;
}

function written(expr: Expr): { text: string; priority: number } {
  switch (expr.kind) {
    case 'number': {
      const value = `${expr.value}${expr.imaginary ? 'j' : ''}`;
      // 5 m stays together: (5 m)·x, never 5 m·x, where x could be read as a unit.
      return expr.unit ? { text: `${value} ${formatUnit(expr.unit)}`, priority: PRIORITY['+']! } : { text: value, priority: expr.value < 0 ? PRIORITY['unary']! : ATOM };
    }
    case 'string':
      return { text: JSON.stringify(expr.value), priority: ATOM };
    case 'boolean':
      return { text: String(expr.value), priority: ATOM };
    case 'variable':
      return { text: expr.name, priority: ATOM };
    case 'unit':
      return { text: `[${formatUnit(expr.unit)}]`, priority: ATOM };
    case 'unary': {
      const own = PRIORITY['unary']!;
      const operand = written(expr.operand);
      const inner = operand.priority < own ? `(${operand.text})` : operand.text;
      return { text: expr.operator === 'not' ? `not ${inner}` : `${expr.operator}${inner}`, priority: own };
    }
    case 'binary': {
      const own = PRIORITY[expr.operator]!;
      const left = written(expr.left);
      const right = written(expr.right);
      // a − (b − c), a/(b·c): the right side keeps its brackets at the same priority; a power groups to the right.
      const leftText = left.priority < own || (expr.operator === '^' && left.priority === own) ? `(${left.text})` : left.text;
      const rightText = right.priority < own || (right.priority === own && expr.operator !== '^' && expr.operator !== '+' && expr.operator !== '*') ? `(${right.text})` : right.text;
      const sign = SIGN[expr.operator] ?? expr.operator;
      const spaced = ['+', '-', 'and', 'or', '==', '!=', '<', '<=', '>', '>='].includes(expr.operator);
      return { text: spaced ? `${leftText} ${sign} ${rightText}` : `${leftText}${sign}${rightText}`, priority: own };
    }
    case 'call': {
      const args = [...expr.args.map(formatExpr), ...expr.named.map((n) => `${n.name}: ${formatExpr(n.value)}`)];
      return { text: `${expr.name}(${args.join(', ')})`, priority: ATOM };
    }
    case 'member':
      return { text: `${atom(expr.object)}.${expr.name}`, priority: ATOM };
    case 'index':
      return { text: `${atom(expr.object)}[${formatExpr(expr.index)}${expr.column ? `, ${formatExpr(expr.column)}` : ''}]`, priority: ATOM };
    case 'vector':
      return { text: `[${expr.items.map(formatExpr).join(', ')}]`, priority: ATOM };
    case 'matrix':
      return { text: `[${expr.rows.map((r) => r.map(formatExpr).join(', ')).join(' | ')}]`, priority: ATOM };
    case 'range':
      return { text: `${formatExpr(expr.low)} .. ${formatExpr(expr.high)}`, priority: 0 };
    case 'date': {
      const d = new Date(expr.days * 86_400_000);
      return { text: d.toISOString().slice(0, 10), priority: ATOM };
    }
  }
}

function atom(expr: Expr): string {
  const w = written(expr);
  return w.priority < ATOM ? `(${w.text})` : w.text;
}
