/**
 * A worksheet of SMath Studio (.sm) as a draft of a sheet (docs/navrhy/IMPORT-CIZICH-VYPOCTU.md). A formula in the file is
 * a row of tokens in postfix, units are marked, regions lie on a page. The aim is what can be checked: SMath stores what it
 * showed, so every value that has a stored result is compared. Nothing is lost: what cannot be converted stays as text with
 * the reason, and the language does not change for it.
 */

import { defaultRegistry, evaluateSheet, type UnitRegistry } from '@kalketa/core';
import { child, parseXml, XmlError, type XmlNode } from './xml.js';

export type NotConverted =
  | { readonly kind: 'function'; readonly name: string }
  | { readonly kind: 'unit'; readonly name: string }
  | { readonly kind: 'form' }
  /** It reads a name that a line left as text assigns: here it would have only a value from before that. */
  | { readonly kind: 'assigned'; readonly name: string }
  | { readonly kind: 'region'; readonly name: string }
  | { readonly kind: 'error'; readonly code: string };

export interface SmathReport {
  /** Regions with a formula, and how many of them became lines of the sheet. */
  readonly formulas: number;
  readonly converted: number;
  readonly texts: number;
  /** What stayed as text, with the reason. */
  readonly left: readonly { readonly written: string; readonly why: NotConverted }[];
  /** Values taken over from SMath as inputs of the sheet: they do not recalculate, and nothing has verified them. */
  readonly frozen: readonly string[];
  /** a redefined further down became a_2: SMath allows it, a sheet does not. */
  readonly renamed: readonly { readonly from: string; readonly to: string }[];
  /** Stored results against the calculation here, within the digits SMath stored. */
  readonly agree: number;
  readonly differ: readonly { readonly name: string; readonly stored: number; readonly here: number; readonly unit: string }[];
  /** Stored results that did not come to a number here. */
  readonly notCompared: number;
}

export interface SmathImport {
  readonly source: string;
  readonly report: SmathReport;
  /** Pictures stored in the worksheet, by the path the sheet reads them at. */
  readonly images: readonly { readonly path: string; readonly bytes: Uint8Array }[];
}

type Node =
  | { readonly k: 'number'; readonly text: string }
  | { readonly k: 'unit'; readonly name: string }
  | { readonly k: 'string'; readonly text: string }
  | { readonly k: 'name'; readonly name: string }
  | { readonly k: 'bracket'; readonly inner: Node }
  | { readonly k: 'op'; readonly op: string; readonly args: readonly Node[] }
  | { readonly k: 'call'; readonly name: string; readonly args: readonly Node[] };

class Unconverted extends Error {
  constructor(readonly why: NotConverted) {
    super(why.kind);
  }
}

/** SMath also keeps .2 and 2. as they were typed. */
const NUMBER = /^(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
const numberText = (text: string) => text.replace(/^\./, '0.').replace(/\.(?=$|[eE])/, '');

/** Postfix tokens to a tree. */
function treeOf(container: XmlNode): Node {
  const stack: Node[] = [];
  for (const e of container.children) {
    if (e.name !== 'e') continue;
    const type = e.attributes.get('type');
    const text = e.text.trim();
    if (type === 'operand') {
      const style = e.attributes.get('style');
      if (style === 'unit') stack.push({ k: 'unit', name: text });
      else if (style === 'string') stack.push({ k: 'string', text: e.text });
      else if (NUMBER.test(text)) stack.push({ k: 'number', text: numberText(text) });
      else stack.push({ k: 'name', name: text });
    } else if (type === 'bracket') {
      const inner = stack.pop();
      if (!inner) throw new Unconverted({ kind: 'form' });
      stack.push({ k: 'bracket', inner });
    } else if (type === 'operator' || type === 'function') {
      const count = Number(e.attributes.get('args') ?? (type === 'operator' ? 2 : 1));
      if (!Number.isInteger(count) || count < 0 || count > stack.length) throw new Unconverted({ kind: 'form' });
      const args = stack.splice(stack.length - count, count);
      stack.push(type === 'operator' ? { k: 'op', op: text, args } : { k: 'call', name: text, args });
    } else throw new Unconverted({ kind: 'form' });
  }
  if (stack.length !== 1) throw new Unconverted({ kind: 'form' });
  return stack[0]!;
}

/** Functions by the name they have here; what is not listed stays as text. */
const FUNCTIONS: Readonly<Record<string, string>> = {
  sin: 'sin', cos: 'cos', tan: 'tan', tg: 'tan', cot: 'cot', ctg: 'cot', sec: 'sec', csc: 'csc', cosec: 'csc',
  asin: 'asin', arcsin: 'asin', acos: 'acos', arccos: 'acos', atan: 'atan', arctan: 'atan', arctg: 'atan', acot: 'acot', arcctg: 'acot', arcsec: 'asec', arccosec: 'acsc',
  sinh: 'sinh', sh: 'sinh', cosh: 'cosh', ch: 'cosh', tanh: 'tanh', th: 'tanh', coth: 'coth', cth: 'coth', sech: 'sech', csch: 'csch', cosech: 'csch',
  asinh: 'asinh', arsh: 'asinh', acosh: 'acosh', arch: 'acosh', atanh: 'atanh', arth: 'atanh',
  sqrt: 'sqrt', exp: 'exp', ln: 'ln', lg: 'log10', abs: 'abs', sign: 'sign', sgn: 'sign', round: 'round', floor: 'floor', ceil: 'ceil', mod: 'mod',
  min: 'min', max: 'max', sum: 'sum', mean: 'mean', median: 'median', stdev: 'stdev', length: 'len', det: 'det', transpose: 'transpose', inverse: 'inverse', if: 'if', rows: 'rows', cols: 'cols', trace: 'trace', norm: 'norm',
  tr: 'trace', Min: 'min', Max: 'max', augment: 'augment', stack: 'stack', col: 'col', row: 'row', submatrix: 'submatrix', rank: 'rank', cross: 'cross',
  atan2: 'atan2', arg: 'arg', Re: 're', Im: 'im', conj: 'conj', fact: 'factorial',
};

/** Units whose name means something else here. A number means an expression in place of the unit. */
const UNIT_NAMES: Readonly<Record<string, string>> = {
  hr: 'h', yr: 'yr', min: 'min', '°': '°', deg: '°', Ohm: 'Ω', ohm: 'Ω', kOhm: 'kΩ', MOhm: 'MΩ', degC: '°C', degF: '°F',
};
const UNITS_BY_VALUE: Readonly<Record<string, string>> = {
  // The international calorie of SMath; a calorie here is the thermochemical one.
  cal: '(4.1868 [J])',
  kcal: '(4186.8 [J])',
};
/** In SMath h is the Planck constant, not an hour, and more of a kind: to be seen by the one who imports. */
const UNITS_LEFT: ReadonlySet<string> = new Set(['h', 'c', 'G', 'R', 'e', 'k']);

const PRECEDENCE: Readonly<Record<string, number>> = { or: 1, and: 2, '==': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3, '+': 4, '-': 4, '·': 5, '/': 5, '^': 7 };
const OPERATORS: Readonly<Record<string, string>> = { '+': '+', '-': '-', '*': '·', '/': '/', '^': '^', '=': '==', '≡': '==', '≠': '!=', '<': '<', '>': '>', '≤': '<=', '≥': '>=', '|': 'or', '&': 'and' };
const KEYWORDS: ReadonlySet<string> = new Set(['in', 'guess', 'solve', 'check', 'derive', 'table', 'unit', 'relation', 'and', 'or', 'not', 'true', 'false', 'source', 'block', 'input', 'output', 'use']);

/** Names written otherwise because of a sign in them, of the import under way: ripple_% is ripple_pct. */
let bySign = new Map<string, string>();
let asWritten = new Set<string>();

/** A name of SMath as a name here: F.y is F_y; what cannot be written goes to text, and so do two names that would become one. */
function ownName(name: string): string {
  const dots = name.replace(/\./g, '_');
  const written = /^\p{L}/u.test(dots) ? dots.replace(/_?[%‰]/g, (sign) => `_${sign.endsWith('%') ? 'pct' : 'permille'}`) : dots;
  if (!/^[\p{L}][\p{L}\p{N}_]*$/u.test(written) || KEYWORDS.has(written)) throw new Unconverted({ kind: 'form' });
  const signed = written !== dots;
  const taken = signed ? asWritten.has(written) || [...bySign].some(([from, to]) => to === written && from !== name) : [...bySign.values()].includes(written);
  if (taken) throw new Unconverted({ kind: 'form' });
  if (signed) bySign.set(name, written);
  else asWritten.add(written);
  return written;
}

interface Scope {
  readonly registry: UnitRegistry;
  /** The name each is written by now: a, then a_2 after it is redefined. */
  readonly aliases: Map<string, string>;
  /** Names local to a function being written. */
  readonly local: Set<string>;
  /** A matrix with text in it became a table: its name, its size. */
  readonly tables: Map<string, { readonly rows: number; readonly cols: number; readonly texts: ReadonlySet<number> }>;
  /** Names assigned by what stayed as text (a loop): their value here would be an old one. */
  readonly overwritten: Set<string>;
  /** A vector filled by a loop whose cells depend on a name still free (x): written out where it is read. */
  readonly formulas: Map<string, string>;
  /** k := range(1, 9): its bounds, for what is assigned over it. */
  readonly ranges: Map<string, readonly [string, string]>;
  /** result[k, 2] := …: the columns assigned over a range, each a series of its own. */
  readonly columns: Map<string, Map<number, string>>;
}

function unitText(node: Node, scope: Scope): string {
  if (node.k === 'bracket') return `(${unitText(node.inner, scope)})`;
  if (node.k === 'unit' || node.k === 'name') return unitName(node.k === 'unit' ? node.name : node.name, scope);
  if (node.k === 'number' && node.text === '1') return '1';
  if (node.k === 'op' && (node.op === '*' || node.op === '/') && node.args.length === 2) return `${unitText(node.args[0]!, scope)}${node.op === '*' ? '·' : '/'}${unitText(node.args[1]!, scope)}`;
  if (node.k === 'op' && node.op === '^' && node.args.length === 2 && node.args[1]!.k === 'number') return `${unitText(node.args[0]!, scope)}^${node.args[1]!.text}`;
  if (node.k === 'op' && node.op === '^' && node.args.length === 2 && node.args[1]!.k === 'op' && node.args[1]!.op === '-' && node.args[1]!.args[0]?.k === 'number') return `${unitText(node.args[0]!, scope)}^-${node.args[1]!.args[0].text}`;
  throw new Unconverted({ kind: 'form' });
}

function unitName(name: string, scope: Scope): string {
  if (UNITS_LEFT.has(name)) throw new Unconverted({ kind: 'unit', name });
  const own = UNIT_NAMES[name] ?? name;
  if (!scope.registry.resolve(own)) throw new Unconverted({ kind: 'unit', name });
  return own;
}

const ATOM = 9;
/** A number with its unit: bound tighter than a sum, in brackets under a product, as 5 [m]/d would read otherwise. */
const WITH_UNIT = 4.5;

function rendered(node: Node, scope: Scope): { text: string; prec: number } {
  const of = (n: Node) => rendered(n, scope);
  switch (node.k) {
    case 'number':
      return { text: node.text, prec: ATOM };
    case 'string':
      return { text: `"${node.text.replace(/"/g, '')}"`, prec: ATOM };
    case 'unit': {
      const value = UNITS_BY_VALUE[node.name];
      if (value) return { text: value, prec: ATOM };
      const unit = unitName(node.name, scope);
      // A unit alone that the sheet also has as a name: [m] would be the series of that name.
      return scope.aliases.has(node.name) ? { text: `(1 [${unit}])`, prec: ATOM } : { text: `[${unit}]`, prec: ATOM };
    }
    case 'name': {
      if (scope.local.has(node.name)) return { text: ownName(node.name), prec: ATOM };
      if (scope.overwritten.has(node.name)) throw new Unconverted({ kind: 'assigned', name: node.name });
      const formula = scope.formulas.get(node.name);
      if (formula) return { text: formula, prec: ATOM };
      if (node.name === 'π' || node.name === 'pi') return { text: 'π', prec: ATOM };
      // A matrix put together by columns reads as those of them it has.
      const assigned = scope.columns.get(node.name);
      if (assigned && assigned.size > 0) return { text: [...assigned.values()].join(', '), prec: ATOM };
      const known = scope.aliases.get(node.name);
      if (known) return { text: known, prec: ATOM };
      // Constants of SMath, where the sheet has not defined such a name.
      if (node.name === 'e') return { text: 'exp(1)', prec: ATOM };
      if (node.name === 'i') return { text: '1j', prec: ATOM };
      return { text: ownName(node.name), prec: ATOM };
    }
    case 'bracket': {
      const inner = of(node.inner);
      return { text: `(${inner.text})`, prec: ATOM };
    }
    case 'op': {
      if (node.args.length === 1 && (node.op === '-' || node.op === '+')) {
        const inner = of(node.args[0]!);
        return { text: `${node.op === '-' ? '-' : ''}${inner.prec < 6 ? `(${inner.text})` : inner.text}`, prec: 6 };
      }
      if (node.args.length === 1 && node.op === '!') return { text: `factorial(${of(node.args[0]!).text})`, prec: ATOM };
      const op = OPERATORS[node.op];
      if (!op || node.args.length !== 2) throw new Unconverted({ kind: 'function', name: node.op });
      const [left, right] = node.args as [Node, Node];
      // e^x: the sheet differentiates exp, a power with x above it not.
      if (op === '^' && left.k === 'name' && left.name === 'e' && !scope.local.has('e') && !scope.aliases.has('e')) return { text: `exp(${of(right).text})`, prec: ATOM };
      // 5 m: a number times a unit.
      if (op === '·' && right.k === 'unit' && left.k === 'number' && !UNITS_BY_VALUE[right.name]) return { text: `${left.text} [${unitName(right.name, scope)}]`, prec: WITH_UNIT };
      const p = PRECEDENCE[op]!;
      const [a, b] = [of(left), of(right)];
      const leftText = a.prec < p || (op === '^' && a.prec <= p) ? `(${a.text})` : a.text;
      const rightText = b.prec < p || (b.prec === p && (op === '-' || op === '/')) ? `(${b.text})` : b.text;
      return { text: `${leftText}${op === '·' || op === '/' || op === '^' ? op : ` ${op} `}${rightText}`, prec: p };
    }
    case 'call':
      return call(node, scope);
  }
}

function call(node: Extract<Node, { k: 'call' }>, scope: Scope): { text: string; prec: number } {
  const of = (n: Node) => rendered(n, scope).text;
  const { name, args } = node;
  // What reads a matrix that became a table, or one put together by columns.
  const first = args[0]?.k === 'name' ? args[0].name : undefined;
  const table = first !== undefined ? scope.tables.get(first) : undefined;
  if (table && first !== undefined) {
    const own = ownName(first);
    if (name === 'rows' && args.length === 1) return { text: String(table.rows), prec: ATOM };
    if (name === 'cols' && args.length === 1) return { text: String(table.cols), prec: ATOM };
    if (name === 'col' && args.length === 2 && args[1]!.k === 'number') return { text: `${own}.c${args[1]!.text}`, prec: ATOM };
    if (name === 'el' && args.length === 3 && args[2]!.k === 'number') return { text: `${own}.c${args[2]!.text}[${of(args[1]!)}]`, prec: ATOM };
    throw new Unconverted({ kind: 'form' });
  }
  const parts = first !== undefined ? scope.columns.get(first) : undefined;
  if (parts && name === 'el' && args.length === 3 && args[2]!.k === 'number' && parts.has(Number(args[2]!.text))) {
    return { text: `${parts.get(Number(args[2]!.text))!}[${of(args[1]!)}]`, prec: ATOM };
  }
  if (name === 'el' && (args.length === 2 || args.length === 3)) {
    const target = rendered(args[0]!, scope);
    return { text: `${target.prec < ATOM ? `(${target.text})` : target.text}[${args.slice(1).map(of).join(', ')}]`, prec: ATOM };
  }
  if (name === 'mat' && args.length >= 3) {
    const [rows, cols] = [args[args.length - 2]!, args[args.length - 1]!];
    if (rows.k !== 'number' || cols.k !== 'number') throw new Unconverted({ kind: 'form' });
    const [r, c] = [Number(rows.text), Number(cols.text)];
    if (r * c !== args.length - 2) throw new Unconverted({ kind: 'form' });
    const cells = args.slice(0, -2).map(of);
    const lines = Array.from({ length: r }, (_, i) => cells.slice(i * c, (i + 1) * c).join(', '));
    return { text: `[${lines.join(' | ')}]`, prec: ATOM };
  }
  if (name === 'log') {
    if (args.length === 1) return { text: `log10(${of(args[0]!)})`, prec: ATOM };
    if (args.length === 2) return { text: `log(${of(args[0]!)}, ${of(args[1]!)})`, prec: ATOM };
  }
  if (name === 'nthroot' && args.length === 2) return { text: `root(${of(args[0]!)}, ${of(args[1]!)})`, prec: ATOM };
  // Their own variable: sum(f, k, a, b) and int(f, x, a, b).
  if ((name === 'sum' || name === 'int') && args.length === 4 && args[1]!.k === 'name') {
    const variable = args[1]!.name;
    const inner: Scope = { ...scope, local: new Set([...scope.local, variable]) };
    const f = rendered(args[0]!, inner).text;
    return { text: `${name === 'sum' ? 'sum' : 'integral'}(${f}, ${ownName(variable)}: ${of(args[2]!)} .. ${of(args[3]!)})`, prec: ATOM };
  }
  // Series go item by item here anyway, and everything is calculated at once.
  if ((name === 'vectorize' || name === 'eval') && args.length === 1) return rendered(args[0]!, scope);
  // diff(f(x), x): the derivative at x, of a function of x being defined.
  if (name === 'diff' && args.length === 2 && args[1]!.k === 'name') {
    const variable = ownName(args[1]!.name);
    return { text: `derivative(${of(args[0]!)}, ${variable}: ${variable})`, prec: ATOM };
  }
  if (name === 'diff' && args.length === 3 && args[1]!.k === 'name') {
    const variable = ownName(args[1]!.name);
    return { text: `derivative(${of(args[0]!)}, ${variable}: ${variable}, order: ${of(args[2]!)})`, prec: ATOM };
  }
  // Its third argument is the second value of the series there: the step here.
  if (name === 'range' && args.length === 2) return { text: `range(${of(args[0]!)}, ${of(args[1]!)})`, prec: ATOM };
  const own = FUNCTIONS[name];
  if (own) return { text: `${own}(${args.map(of).join(', ')})`, prec: ATOM };
  // A function of the sheet itself.
  if (scope.aliases.has(`${name}()`)) return { text: `${ownName(name)}(${args.map(of).join(', ')})`, prec: ATOM };
  throw new Unconverted({ kind: 'function', name });
}

/** A number with what stands with it: 1.9891·10^30·'kg; undefined for what is more than that. */
function cellOf(node: Node, scope: Scope): { value: number; unit: string } | undefined {
  if (node.k === 'bracket') return cellOf(node.inner, scope);
  if (node.k === 'number') return { value: Number(node.text), unit: '' };
  if (node.k === 'unit') return { value: 1, unit: unitName(node.name, scope) };
  if (node.k !== 'op' || node.args.length === 0) return undefined;
  if (node.op === '-' && node.args.length === 1) {
    const inner = cellOf(node.args[0]!, scope);
    return inner && { value: -inner.value, unit: inner.unit };
  }
  if (node.args.length !== 2) return undefined;
  if (node.op === '^' && node.args[0]!.k === 'number') {
    const exponent = cellOf(node.args[1]!, scope);
    return exponent && !exponent.unit ? { value: Number(node.args[0]!.text) ** exponent.value, unit: '' } : undefined;
  }
  if (node.op === '*' || node.op === '/') {
    const a = cellOf(node.args[0]!, scope);
    if (!a) return undefined;
    if (node.op === '/' && node.args[1]!.k !== 'number') return a && (node.args[1]!.k === 'unit' || node.args[1]!.k === 'bracket' || node.args[1]!.k === 'op') ? { value: a.value, unit: `${a.unit || '1'}/${unitText(node.args[1]!, scope)}` } : undefined;
    const b = cellOf(node.args[1]!, scope);
    if (!b) return undefined;
    return { value: node.op === '*' ? a.value * b.value : a.value / b.value, unit: [a.unit, b.unit].filter(Boolean).join('·') };
  }
  return undefined;
}

/**
 * A matrix with text in it (names beside numbers, as SMath users like to give their data) as a table of the sheet: a
 * matrix here holds numbers. A column has one unit; what does not fit that stays as written.
 */
function tableOf(name: string, node: Extract<Node, { k: 'call' }>, scope: Scope): string | undefined {
  const size = node.args.slice(-2);
  const cells = node.args.slice(0, -2);
  if (size[0]?.k !== 'number' || size[1]?.k !== 'number' || !cells.some((c) => c.k === 'string')) return undefined;
  const [rows, cols] = [Number(size[0].text), Number(size[1].text)];
  if (rows * cols !== cells.length) throw new Unconverted({ kind: 'form' });
  const at = (i: number, j: number) => cells[i * cols + j]!;
  const clean = (text: string) => text.replace(/\\[0-9a-fA-F]{4}\\?/g, ' ').replace(/[|\n]/g, ' ').trim();
  const head: string[] = [];
  const columns = Array.from({ length: cols }, (_, j) => {
    const items = Array.from({ length: rows }, (_, i) => at(i, j));
    if (items.every((c) => c.k === 'string')) {
      head.push(`c${j + 1}`);
      return items.map((c) => clean((c as { text: string }).text));
    }
    const numbers = items.map((c) => cellOf(c, scope));
    if (numbers.some((c) => !c) || new Set(numbers.map((c) => c!.unit)).size !== 1) throw new Unconverted({ kind: 'form' });
    const unit = numbers[0]!.unit;
    head.push(unit ? `c${j + 1} [${unit}]` : `c${j + 1}`);
    return numbers.map((c) => String(Number(c!.value.toPrecision(15))));
  });
  const texts = new Set(head.flatMap((h, j) => (h === `c${j + 1}` && cells[j]!.k === 'string' ? [j + 1] : [])));
  scope.tables.set(name, { rows, cols, texts });
  scope.aliases.set(name, ownName(name));
  const row = (cellsOfRow: readonly string[]) => `    | ${cellsOfRow.join(' | ')} |`;
  return [`table ${ownName(name)}:`, row(head), ...Array.from({ length: rows }, (_, i) => row(columns.map((c) => c[i]!)))].join('\n');
}

/** A chart of curves of x, in the view it has in SMath; undefined for what draws otherwise (a script, a path). */
function plotLine(region: XmlNode, plot: XmlNode, scope: Scope, pixelsPerUnitAtOne: number | undefined): string | undefined {
  const input = child(plot, 'input');
  if (!input || plot.attributes.get('type') !== '2d') return undefined;
  const tree = treeOf(input);
  const curves = tree.k === 'call' && tree.name === 'sys' && tree.args.length >= 3 ? tree.args.slice(0, -2) : [tree];
  const readsX = (n: Node): boolean => (n.k === 'name' ? n.name === 'x' : n.k === 'bracket' ? readsX(n.inner) : n.k === 'op' || n.k === 'call' ? n.args.some(readsX) : false);
  if (!curves.every(readsX)) return undefined;
  const inner: Scope = { ...scope, local: new Set([...scope.local, 'x']) };
  const bodies = curves.map((c) => rendered(c, inner).text);
  const width = Number(region.attributes.get('width') ?? 0);
  const height = Number(region.attributes.get('height') ?? 0);
  const attr = (name: string, fallback: number) => Number(plot.attributes.get(name) ?? fallback);
  const pixels = (zoom: number) => (pixelsPerUnitAtOne !== undefined ? (pixelsPerUnitAtOne * zoom * width) / height : (zoom * width) / 37.5);
  const short = (v: number) => String(Number(v.toPrecision(4)));
  // SMath keeps the zoom across in scale_y, the one upwards in scale_x; transpose moves the drawing, in pixels.
  const [px, py] = [pixels(attr('scale_y', 1)), pixels(attr('scale_x', 1))];
  const [sx, sy] = [attr('transpose_x', 0), attr('transpose_y', 0)];
  if (!(px > 0 && py > 0 && width > 0 && height > 0)) return undefined;
  const span = `x: ${short((-width / 2 - sx) / px)} .. ${short((width / 2 - sx) / px)}`;
  return `plot(${bodies.join(', ')}, ${span}, ylim: ${short((-sy - height / 2) / py)} .. ${short((-sy + height / 2) / py)})`;
}

/**
 * for i in a .. b: v[i] := formula of i, not reading v: nothing is overwritten, it is a vector by its index. With a name
 * still free in it (x) it has no value yet: it is written out where it is read, g(x) := v.
 */
function filledVector(tree: Node, scope: Scope): { line: string; name?: string } | undefined {
  if (tree.k !== 'call' || tree.name !== 'for') return undefined;
  const bounds = (): { index: string; low: Node; high: Node } | undefined => {
    const [first, second, third] = tree.args;
    if (tree.args.length === 3 && first?.k === 'name' && second?.k === 'call' && second.name === 'range' && second.args.length === 2) return { index: first.name, low: second.args[0]!, high: second.args[1]! };
    if (tree.args.length !== 4 || first?.k !== 'op' || first.op !== ':' || first.args[0]?.k !== 'name' || second?.k !== 'op' || second.op !== '≤' || third?.k !== 'op' || third.op !== ':') return undefined;
    const index = first.args[0].name;
    const step = third.args[1];
    const stepsByOne = step?.k === 'op' && step.op === '+' && step.args[0]?.k === 'name' && step.args[0].name === index && step.args[1]?.k === 'number' && step.args[1].text === '1';
    return stepsByOne && second.args[0]?.k === 'name' && second.args[0].name === index ? { index, low: first.args[1]!, high: second.args[1]! } : undefined;
  };
  const loop = bounds();
  const body = tree.args.at(-1)!;
  if (!loop || body.k !== 'op' || body.op !== ':') return undefined;
  const [left, right] = body.args as [Node, Node];
  if (left.k !== 'call' || left.name !== 'el' || left.args.length !== 2 || left.args[0]?.k !== 'name' || left.args[1]?.k !== 'name' || left.args[1].name !== loop.index) return undefined;
  const owner = left.args[0].name;
  const names = (n: Node): string[] => (n.k === 'name' ? [n.name] : n.k === 'bracket' ? names(n.inner) : n.k === 'op' || n.k === 'call' ? n.args.flatMap(names) : []);
  const read = names(right);
  if (read.includes(owner)) return undefined;
  const free = read.filter((n) => n !== loop.index && n !== 'π' && n !== 'pi' && n !== 'e' && n !== 'i' && !scope.aliases.has(n) && !scope.local.has(n));
  const inner: Scope = { ...scope, local: new Set([...scope.local, loop.index]) };
  const vector = `vector(${rendered(right, inner).text}, ${ownName(loop.index)}: ${rendered(loop.low, scope).text} .. ${rendered(loop.high, scope).text})`;
  if (free.length > 0) {
    scope.formulas.set(owner, vector);
    return { line: quoted(writtenOf(tree)) };
  }
  const shown = scope.aliases.has(`${owner}()`) ? `${ownName(owner)}_v` : ownName(owner);
  scope.aliases.set(owner, shown);
  return { line: `${shown} := ${vector}`, name: shown };
}

/** The line of a formula; a definition registers its name. */
function lineOf(tree: Node, contract: string | undefined, scope: Scope, renamed: { from: string; to: string }[]): { line: string; name?: string } {
  const target = contract ? ` | ${contract}` : '';
  const filled = filledVector(tree, scope);
  if (filled) return filled;
  if (tree.k === 'op' && tree.op === ':' && tree.args.length === 2) {
    const [left, right] = tree.args as [Node, Node];
    if (left.k === 'name' && right.k === 'call' && right.name === 'mat') {
      const table = tableOf(left.name, right, scope);
      if (table) return { line: table };
    }
    // result := col(data, 1), names: they stand in the table, a series holds numbers.
    if (left.k === 'name' && right.k === 'call' && right.name === 'col' && right.args[0]?.k === 'name' && right.args[1]?.k === 'number' && scope.tables.get(right.args[0].name)?.texts.has(Number(right.args[1].text))) {
      scope.columns.set(left.name, new Map());
      return { line: quoted(writtenOf(tree)) };
    }
    // result[k, 2] := f(…) over k := range(…): SMath goes through k, here it is a series by its index.
    if (left.k === 'call' && left.name === 'el' && left.args[0]?.k === 'name' && left.args[1]?.k === 'name' && scope.ranges.has(left.args[1].name)) {
      const [owner, index, place] = left.args as [Extract<Node, { k: 'name' }>, Extract<Node, { k: 'name' }>, Node | undefined];
      if (place && place.k !== 'number') throw new Unconverted({ kind: 'form' });
      const column = place ? Number((place as { text: string }).text) : 1;
      const [low, high] = scope.ranges.get(index.name)!;
      const inner: Scope = { ...scope, local: new Set([...scope.local, index.name]) };
      const body = rendered(right, inner).text;
      const shown = `${ownName(owner.name)}_c${column}`;
      const parts = scope.columns.get(owner.name) ?? new Map<number, string>();
      parts.set(column, shown);
      scope.columns.set(owner.name, parts);
      return { line: `${shown} := vector(${body}, ${ownName(index.name)}: ${low} .. ${high})${target}`, name: shown };
    }
    if (left.k === 'name') {
      const body = rendered(right, scope).text;
      const name = ownName(left.name);
      scope.overwritten.delete(left.name);
      if (right.k === 'call' && right.name === 'range' && right.args.length === 2) scope.ranges.set(left.name, [rendered(right.args[0]!, scope).text, rendered(right.args[1]!, scope).text]);
      let shown = name;
      if (scope.aliases.has(left.name)) {
        let n = 2;
        const taken = new Set(scope.aliases.values());
        while (taken.has(`${name}_${n}`)) n++;
        shown = `${name}_${n}`;
        renamed.push({ from: name, to: shown });
      }
      scope.aliases.set(left.name, shown);
      return { line: `${shown} := ${body}${target}`, name: shown };
    }
    if (left.k === 'call' && left.args.every((a) => a.k === 'name')) {
      const params = left.args.map((a) => (a as { name: string }).name);
      const inner: Scope = { ...scope, local: new Set(params) };
      const body = rendered(right, inner).text;
      const name = ownName(left.name);
      scope.aliases.set(`${left.name}()`, name);
      return { line: `${name}(${params.map(ownName).join(', ')}) := ${body}${target}` };
    }
    throw new Unconverted({ kind: 'form' });
  }
  return { line: `${rendered(tree, scope).text}${target}` };
}

/** The names a formula left as text assigns; what a function does stays in it, sorting a matrix leaves its columns. */
function assignedBy(tree: Node): string[] {
  if (tree.k === 'op' && tree.op === ':' && tree.args.length === 2) {
    const [left, right] = tree.args as [Node, Node];
    if (left.k === 'call' && left.name !== 'el') return [];
    if (left.k === 'name' && right.k === 'call' && right.name === 'csort') return [];
  }
  const walk = (n: Node): string[] => {
    if (n.k === 'bracket') return walk(n.inner);
    if (n.k !== 'op' && n.k !== 'call') return [];
    const below = n.args.flatMap(walk);
    if (n.k !== 'op' || n.op !== ':') return below;
    const target = n.args[0]!;
    const owner = target.k === 'call' && target.name === 'el' ? target.args[0] : target;
    return owner?.k === 'name' ? [owner.name, ...below] : below;
  };
  return walk(tree);
}

/** What SMath stored for a formula, as words: the sheet cannot calculate it, the reader still sees it. */
function storedWords(math: XmlNode, scope: Scope): string | undefined {
  const result = child(math, 'result');
  if (!result || result.children.length === 0) return undefined;
  const clean: Scope = { ...scope, overwritten: new Set(), columns: new Map(), tables: new Map(), local: new Set() };
  const shown = (n: Node): string => {
    if (n.k === 'string') return n.text.trim();
    if (n.k === 'bracket') return shown(n.inner);
    if (n.k === 'call' && n.name === 'mat' && n.args.length >= 3) {
      const [rows, cols] = n.args.slice(-2).map((a) => (a.k === 'number' ? Number(a.text) : 0)) as [number, number];
      const cells = n.args.slice(0, -2).map(shown);
      if (rows * cols !== cells.length) return writtenOf(n);
      return `[${Array.from({ length: rows }, (_, i) => cells.slice(i * cols, (i + 1) * cols).join(' ')).join('; ')}]`;
    }
    try {
      return rendered(n, clean).text;
    } catch (err) {
      if (err instanceof Unconverted) return writtenOf(n);
      throw err;
    }
  };
  try {
    // In words a unit needs no brackets of the syntax: 3.7·m/s^2.
    return shown(treeOf(result))
      .replace(/"/g, '')
      .replace(/\[([^[\];]+)\]/g, (whole, inner: string) => (/^[\p{L}°µ]/u.test(inner) && !inner.includes(' ') ? inner : whole));
  } catch (err) {
    if (err instanceof Unconverted) return undefined;
    throw err;
  }
}

/** The value SMath stored, as an input of the sheet; undefined for what is more than numbers and units. */
function frozenValue(math: XmlNode, contract: string | undefined, scope: Scope): string | undefined {
  const result = child(math, 'result');
  if (!result || result.children.length === 0) return undefined;
  const constant = (n: Node): boolean =>
    n.k === 'number' || n.k === 'unit' || (n.k === 'bracket' ? constant(n.inner) : (n.k === 'op' || n.k === 'call') && (n.k === 'op' || n.name === 'mat') && n.args.every(constant));
  const hasUnit = (n: Node): boolean => n.k === 'unit' || (n.k === 'bracket' ? hasUnit(n.inner) : (n.k === 'op' || n.k === 'call') && n.args.some(hasUnit));
  try {
    const tree = treeOf(result);
    if (!constant(tree) || (contract && tree.k === 'call')) return undefined;
    const clean: Scope = { ...scope, overwritten: new Set(), columns: new Map(), tables: new Map(), local: new Set(), aliases: new Map(), formulas: new Map() };
    const value = rendered(tree, clean).text;
    return contract && !hasUnit(tree) ? `${value} [${contract}]` : value;
  } catch (err) {
    if (err instanceof Unconverted) return undefined;
    throw err;
  }
}

/** What stands beside a value taken over from SMath: a document in its language, so here and not in the catalog. */
const FROZEN_NOTE: Readonly<Record<string, string>> = {
  cs: 'hodnota ze SMathu, nepřepočítává se, neověřeno',
  en: 'value from SMath, not recalculated, not verified',
};

/** A formula left as text, with what SMath had for it. */
const asWords = (written: string, stored: string | undefined): string => quoted(stored ? `${written} = ${stored} (SMath)` : written);

/** The plain text of a tree, for what stays as text. */
function writtenOf(node: Node): string {
  switch (node.k) {
    case 'number':
      return node.text;
    case 'unit':
      return `'${node.name}`;
    case 'string':
      return `"${node.text}"`;
    case 'name':
      return node.name;
    case 'bracket':
      return `(${writtenOf(node.inner)})`;
    case 'op':
      return node.args.length === 2 ? `${writtenOf(node.args[0]!)} ${node.op} ${writtenOf(node.args[1]!)}` : `${node.op}${node.args.map(writtenOf).join('')}`;
    case 'call':
      return `${node.name}(${node.args.map(writtenOf).join(', ')})`;
  }
}

const quoted = (text: string) => `"${text.replace(/"/g, "'").replace(/\s*\n\s*/g, ' ').trim()}"`;

interface Line {
  text: string;
  /** What SMath showed for it: its value, in its unit. */
  /** unit: the one the line asks for, its value shown so; own: a unit that came with the result alone. */
  stored?: { value: string; digits: number; unit: string; own: string; name: string } | undefined;
  written?: string;
  /** What SMath stored, as words, for when the line stays as text. */
  words?: string | undefined;
}

/** The digits SMath stored: 6.6e4 has two, so 66 500 agrees with it. */
function digitsOf(number: string): number {
  return number.replace(/[eE].*$/, '').replace('.', '').replace(/^0+/, '').length || 1;
}

/** A stored result with a unit of its own: 0.25, A, * in the tokens; undefined when it is more than that. */
function storedWithUnit(result: XmlNode, scope: Scope): { value: string; unit: string } | undefined {
  try {
    const tree = treeOf(result);
    if (tree.k === 'op' && tree.op === '*' && tree.args.length === 2) {
      const [left, right] = tree.args as [Node, Node];
      const hasUnit = (n: Node): boolean => n.k === 'unit' || (n.k === 'bracket' && hasUnit(n.inner)) || (n.k === 'op' && n.args.some(hasUnit));
      if (hasUnit(right) && !hasUnit(left)) {
        const value = numberOf(left);
        if (value !== undefined) return { value, unit: unitText(right, scope) };
      }
    }
    const plain = numberOf(tree);
    return plain === undefined ? undefined : { value: plain, unit: '' };
  } catch (err) {
    if (err instanceof Unconverted) return undefined;
    throw err;
  }
}

function numberOf(n: Node): string | undefined {
  if (n.k === 'number') return n.text;
  if (n.k === 'bracket') return numberOf(n.inner);
  if (n.k === 'op' && n.op === '-' && n.args.length === 1) {
    const inner = numberOf(n.args[0]!);
    return inner === undefined ? undefined : `-${inner}`;
  }
  if (n.k === 'op' && n.op === '*' && n.args.length === 2 && n.args[1]!.k === 'op' && n.args[1]!.op === '^') {
    const [mantissa, power] = [numberOf(n.args[0]!), n.args[1]!.args];
    const [base, exponent] = [power[0], power[1] ? numberOf(power[1]) : undefined];
    if (mantissa !== undefined && base?.k === 'number' && base.text === '10' && exponent !== undefined) return `${mantissa}e${exponent}`;
  }
  if (n.k === 'op' && n.op === '^' && n.args.length === 2 && n.args[0]!.k === 'number' && n.args[0]!.text === '10') {
    const exponent = numberOf(n.args[1]!);
    return exponent === undefined ? undefined : `1e${exponent}`;
  }
  return undefined;
}

/** A stored result as a number; undefined when it is more than a number (a matrix, a symbol). */
function storedValue(result: XmlNode): string | undefined {
  try {
    const tree = treeOf(result);
    const value = (n: Node): string | undefined => {
      if (n.k === 'number') return n.text;
      if (n.k === 'bracket') return value(n.inner);
      if (n.k === 'op' && n.op === '-' && n.args.length === 1) {
        const inner = value(n.args[0]!);
        return inner === undefined ? undefined : `-${inner}`;
      }
      if (n.k === 'op' && n.op === '*' && n.args.length === 2 && n.args[1]!.k === 'op' && n.args[1]!.op === '^') {
        const [mantissa, power] = [value(n.args[0]!), n.args[1]!.args];
        const [base, exponent] = [power[0], power[1] ? value(power[1]) : undefined];
        if (mantissa !== undefined && base?.k === 'number' && base.text === '10' && exponent !== undefined) return `${mantissa}e${exponent}`;
      }
      if (n.k === 'op' && n.op === '^' && n.args.length === 2 && n.args[0]!.k === 'number' && n.args[0]!.text === '10') {
        const exponent = value(n.args[1]!);
        return exponent === undefined ? undefined : `1e${exponent}`;
      }
      return undefined;
    };
    return value(tree);
  } catch (err) {
    if (err instanceof Unconverted) return undefined;
    throw err;
  }
}

/** A text is in more languages: the first one wanted that it has, else the first it has. */
const LANGUAGE_CODES: Readonly<Record<string, readonly string[]>> = { cs: ['ces', 'cze', 'cs'], en: ['eng', 'en'] };

export function importSmath(xml: string, registry: UnitRegistry = defaultRegistry, language = 'en'): SmathImport {
  bySign = new Map();
  asWritten = new Set();
  const wanted = [...(LANGUAGE_CODES[language] ?? [language]), ...LANGUAGE_CODES['en']!];
  const root = parseXml(xml);
  // Newer versions: <worksheet><settings>…</settings><regions>…; older ones: <regions> alone.
  const holders = root.name === 'regions' ? [root] : root.name === 'worksheet' ? root.children.filter((c) => c.name === 'regions') : [];
  if (holders.length === 0) throw new XmlError('not a worksheet of SMath');
  // SMath calculates down the page and, on one height, from the left.
  const num = (r: XmlNode, name: string) => Number(r.attributes.get(name) ?? 0);
  const byPlace = (a: XmlNode, b: XmlNode) => num(a, 'top') - num(b, 'top') || num(a, 'left') - num(b, 'left');
  // An area holds regions of its own, also when it is collapsed: the calculation may lie there. They come where it stands.
  const flat = (regions: readonly XmlNode[]): XmlNode[] =>
    [...regions].sort(byPlace).flatMap((r) => (child(r, 'area') ? flat(r.children.filter((c) => c.name === 'region')) : [r]));
  const regions = flat(holders.flatMap((h) => h.children).filter((c) => c.name === 'region'));
  const scope: Scope = { registry, aliases: new Map(), local: new Set(), tables: new Map(), overwritten: new Set(), formulas: new Map(), ranges: new Map(), columns: new Map() };
  const images: { path: string; bytes: Uint8Array }[] = [];
  // Older versions of its plot: pixels a unit go with zoom and the shape of the region, read from the screen of SMath
  // on four charts of three worksheets; from 1.9 on with the width of the region alone.
  const plotVersion = (function find(n: XmlNode): string | undefined {
    if (n.name === 'assembly' && n.attributes.get('name') === 'Plot Region') return n.attributes.get('version');
    for (const c of n.children) {
      const found = find(c);
      if (found) return found;
    }
    return undefined;
  })(root);
  const [major = 0, minor = 0] = (plotVersion ?? '').split('.').map(Number);
  const plotPixels = major > 1 || (major === 1 && minor >= 9) ? undefined : 6.15;
  const renamed: { from: string; to: string }[] = [];
  const left: { written: string; why: NotConverted }[] = [];
  const frozen: string[] = [];
  const lines: Line[] = [];
  let formulas = 0;
  let texts = 0;
  for (const region of regions) {
    const math = child(region, 'math');
    const variants = region.children.filter((c) => c.name === 'text');
    const text = wanted.map((code) => variants.find((v) => v.attributes.get('lang') === code)).find(Boolean) ?? variants[0];
    if (text) {
      const words = paragraphs(text);
      if (words) {
        lines.push({ text: quoted(words) });
        texts++;
      }
      continue;
    }
    const picture = child(region, 'picture');
    const raw = picture && child(picture, 'raw');
    if (raw && raw.attributes.get('encoding') === 'base64') {
      const format = (raw.attributes.get('format') ?? 'png').toLowerCase().replace(/[^a-z]/g, '');
      try {
        const bytes = Uint8Array.from(atob(raw.text.replace(/\s/g, '')), (c) => c.charCodeAt(0));
        const path = `images/smath/picture-${images.length + 1}.${format}`;
        images.push({ path, bytes });
        lines.push({ text: `![](${path})` });
        continue;
      } catch (err) {
        if (!(err instanceof Error)) throw err;
      }
    }
    const plot = child(region, 'plot');
    if (plot) {
      try {
        const line = plotLine(region, plot, scope, plotPixels);
        if (line) {
          formulas++;
          lines.push({ text: line, written: 'plot' });
          continue;
        }
      } catch (err) {
        if (!(err instanceof Unconverted)) throw err;
      }
    }
    if (!math) {
      const kind = region.children[0]?.name ?? 'region';
      left.push({ written: kind, why: { kind: 'region', name: kind } });
      lines.push({ text: quoted(`[${kind}]`), written: kind });
      continue;
    }
    formulas++;
    const input = child(math, 'input');
    if (!input) continue;
    let tree: Node | undefined;
    const words = storedWords(math, scope);
    try {
      tree = treeOf(input);
      const contractNode = child(math, 'contract');
      const contract = contractNode && contractNode.children.length > 0 ? unitText(treeOf(contractNode), scope) : undefined;
      // What a line left as text assigned, shown: its value as an input, marked, so the rest of the sheet goes on calculating.
      // The file may have been saved without recalculating, so it is not called verified.
      const taken = tree.k === 'name' && scope.overwritten.has(tree.name) ? frozenValue(math, contract, scope) : undefined;
      if (taken !== undefined && tree.k === 'name') {
        const own = ownName(tree.name);
        const before = scope.aliases.get(tree.name);
        let shown = before ?? own;
        if (before !== undefined) {
          const reads = new RegExp(`(^|[^\\p{L}\\p{N}_.])${before}($|[^\\p{L}\\p{N}_])`, 'u');
          const at = lines.findIndex((l) => l.text.startsWith(`${before} :=`));
          const read = lines.slice(at + 1).some((l) => !l.text.startsWith('"') && reads.test(l.text));
          // The start value of the loop goes with the loop; read by something else, it keeps its line.
          if (at >= 0 && !read) lines[at] = { text: quoted(lines[at]!.written ?? lines[at]!.text) };
          else {
            let n = 2;
            const names = new Set(scope.aliases.values());
            while (names.has(`${own}_${n}`)) n++;
            shown = `${own}_${n}`;
            renamed.push({ from: own, to: shown });
          }
        }
        scope.overwritten.delete(tree.name);
        scope.aliases.set(tree.name, shown);
        frozen.push(shown);
        lines.push({ text: `${shown} := ${taken} ' ${FROZEN_NOTE[language] ?? FROZEN_NOTE['en']!}`, written: writtenOf(tree), words });
        continue;
      }
      const { line, name } = lineOf(tree, contract, scope, renamed);
      const result = child(math, 'result');
      const found = result && result.attributes.get('action') !== 'symbolic' ? storedWithUnit(result, scope) : undefined;
      const value = found?.value;
      const stored = found ? { value: found.value, digits: digitsOf(found.value.replace(/^-/, '')), unit: contract ?? '', own: contract ? '' : found.unit, name: name ?? writtenOf(tree) } : undefined;
      lines.push({ text: line, stored, written: writtenOf(tree), words });
      // A matrix put together by columns: the series is alive, the whole of it, with its names and order, is SMath's.
      if (tree.k === 'name' && scope.columns.get(tree.name)?.size && words) lines.push({ text: asWords(writtenOf(tree), words) });
      if (result && value === undefined) notNumbers++;
    } catch (err) {
      if (!(err instanceof Unconverted)) throw err;
      const written = tree ? writtenOf(tree) : '';
      left.push({ written, why: err.why });
      lines.push({ text: asWords(written, words) });
      if (tree) for (const name of assignedBy(tree)) scope.overwritten.add(name);
    }
  }
  notNumbersTotal = notNumbers;
  notNumbers = 0;

  // What the calculation refuses goes to text as well; what it depended on then shows as not calculated.
  /** The index in `lines` of a line of the source: a table takes more of them. */
  const indexOfLine = (at: number): number => {
    let line = 1;
    for (let i = 0; i < lines.length; i++) {
      line += lines[i]!.text.split('\n').length;
      if (at < line) return i;
    }
    return -1;
  };
  let source = lines.map((l) => l.text).join('\n');
  for (let round = 0; round < 40; round++) {
    const result = evaluateSheet(source);
    const wrong = result.statements.filter((s) => s.status === 'error');
    if (wrong.length === 0) break;
    // A function reads what the page defines below it, as SMath allows: it goes under that.
    const late = wrong.flatMap((s) => {
      const d = s.diagnostics.find((x) => x.code === 'E-DEFINED-LATER');
      const from = indexOfLine(s.statement.span.line);
      const text = lines[from]?.text ?? '';
      if (!d || !/^[^\s(]+\([^)]*\) :=/.test(text)) return [];
      const to = lines.findIndex((l) => l.text.startsWith(`${String(d.params['name'])} :=`) || l.text.startsWith(`table ${String(d.params['name'])}:`));
      return to > from ? [[from, to] as const] : [];
    })[0];
    if (late) {
      const [moved] = lines.splice(late[0], 1);
      lines.splice(late[1], 0, moved!);
      source = lines.map((l) => l.text).join('\n');
      continue;
    }
    for (const s of wrong) {
      const i = indexOfLine(s.statement.span.line);
      const line = lines[i];
      if (!line || line.text.startsWith('"')) continue;
      const code = s.diagnostics.find((d) => d.severity === 'error')?.code ?? '';
      // A name that is not known yet says only that its source was left out: not worth a report of its own.
      left.push({ written: line.written ?? line.text, why: { kind: 'error', code } });
      lines[i] = { text: asWords(line.written ?? line.text, line.words), written: line.written ?? line.text };
    }
    const next = lines.map((l) => l.text).join('\n');
    if (next === source) break;
    source = next;
  }

  // The stored results against what is calculated here.
  const result = evaluateSheet(source);
  let agree = 0;
  let notCompared = notNumbersTotal;
  const differ: { name: string; stored: number; here: number; unit: string }[] = [];
  lines.forEach((line, i) => {
    if (!line.stored) return;
    const statement = result.statements.find((s) => indexOfLine(s.statement.span.line) === i);
    const here = statement?.display;
    if (!here || statement.status !== 'ok' || here.im) {
      notCompared++;
      return;
    }
    // A unit stored with the result: to SI, by the calculation itself.
    const ownScale = line.stored.own ? (evaluateSheet(`u := 1 [${line.stored.own}]`).values.get('u') as { si?: number } | undefined)?.si : 1;
    if (ownScale === undefined) {
      notCompared++;
      return;
    }
    const stored = Number(line.stored.value) * ownScale;
    // Half of the last digit stored: 6.6e4 stands for 65 500 to 66 500. Of the number as written, before its own unit.
    const written = Math.abs(Number(line.stored.value));
    const lastDigit = written > 0 ? 10 ** (Math.floor(Math.log10(written)) - line.stored.digits + 1) : 0;
    const tolerance = 0.55 * lastDigit * ownScale;
    // Without a unit asked for, SMath shows SI: compared through the value here in SI.
    const inUnit = line.stored.unit ? here.value : valueSi(statement.value, here.value);
    if (Math.abs(inUnit - stored) <= Math.max(tolerance, 1e-12)) agree++;
    else differ.push({ name: line.stored.name, stored, here: inUnit, unit: line.stored.unit || (line.stored.own ? 'SI' : '') });
  });
  for (const [from, to] of bySign) renamed.push({ from, to });
  const asText = new Set(left.map((l) => l.written));
  const converted = lines.filter((l) => l.written !== undefined && !l.text.startsWith('"') && !asText.has(l.written)).length;
  return { source: `${source}\n`, report: { formulas, converted, texts, left, frozen, renamed, agree, differ, notCompared }, images };
}

let notNumbers = 0;
let notNumbersTotal = 0;

function valueSi(value: unknown, fallback: number): number {
  const q = value as { type?: string; si?: number } | undefined;
  return q?.type === 'quantity' && typeof q.si === 'number' ? q.si : fallback;
}

/** The words of a text region, the first language only. */
function paragraphs(text: XmlNode): string {
  const words = (node: XmlNode): string => `${node.text} ${node.children.map(words).join(' ')}`.replace(/\s+/g, ' ').trim();
  const first = text.children.find((c) => c.name === 'content') ?? text;
  return words(first);
}
