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
  | { readonly kind: 'region'; readonly name: string }
  | { readonly kind: 'error'; readonly code: string };

export interface SmathReport {
  /** Regions with a formula, and how many of them became lines of the sheet. */
  readonly formulas: number;
  readonly converted: number;
  readonly texts: number;
  /** What stayed as text, with the reason. */
  readonly left: readonly { readonly written: string; readonly why: NotConverted }[];
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

const NUMBER = /^\d+(\.\d+)?([eE][-+]?\d+)?$/;

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
      else if (NUMBER.test(text)) stack.push({ k: 'number', text });
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

/** A name of SMath as a name here: F.y is F_y; what cannot be written goes to text. */
function ownName(name: string): string {
  const written = name.replace(/\./g, '_');
  if (!/^[\p{L}][\p{L}\p{N}_]*$/u.test(written) || KEYWORDS.has(written)) throw new Unconverted({ kind: 'form' });
  return written;
}

interface Scope {
  readonly registry: UnitRegistry;
  /** The name each is written by now: a, then a_2 after it is redefined. */
  readonly aliases: Map<string, string>;
  /** Names local to a function being written. */
  readonly local: Set<string>;
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
      if (node.name === 'π' || node.name === 'pi') return { text: 'π', prec: ATOM };
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
  // Its third argument is the second value of the series there: the step here.
  if (name === 'range' && args.length === 2) return { text: `range(${of(args[0]!)}, ${of(args[1]!)})`, prec: ATOM };
  const own = FUNCTIONS[name];
  if (own) return { text: `${own}(${args.map(of).join(', ')})`, prec: ATOM };
  // A function of the sheet itself.
  if (scope.aliases.has(`${name}()`)) return { text: `${ownName(name)}(${args.map(of).join(', ')})`, prec: ATOM };
  throw new Unconverted({ kind: 'function', name });
}

/** The line of a formula; a definition registers its name. */
function lineOf(tree: Node, contract: string | undefined, scope: Scope, renamed: { from: string; to: string }[]): { line: string; name?: string } {
  const target = contract ? ` | ${contract}` : '';
  if (tree.k === 'op' && tree.op === ':' && tree.args.length === 2) {
    const [left, right] = tree.args as [Node, Node];
    if (left.k === 'name') {
      const body = rendered(right, scope).text;
      const name = ownName(left.name);
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
  const scope: Scope = { registry, aliases: new Map(), local: new Set() };
  const renamed: { from: string; to: string }[] = [];
  const left: { written: string; why: NotConverted }[] = [];
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
    try {
      tree = treeOf(input);
      const contractNode = child(math, 'contract');
      const contract = contractNode && contractNode.children.length > 0 ? unitText(treeOf(contractNode), scope) : undefined;
      const { line, name } = lineOf(tree, contract, scope, renamed);
      const result = child(math, 'result');
      const found = result && result.attributes.get('action') !== 'symbolic' ? storedWithUnit(result, scope) : undefined;
      const value = found?.value;
      const stored = found ? { value: found.value, digits: digitsOf(found.value.replace(/^-/, '')), unit: contract ?? '', own: contract ? '' : found.unit, name: name ?? writtenOf(tree) } : undefined;
      lines.push({ text: line, stored, written: writtenOf(tree) });
      if (result && value === undefined) notNumbers++;
    } catch (err) {
      if (!(err instanceof Unconverted)) throw err;
      const written = tree ? writtenOf(tree) : '';
      left.push({ written, why: err.why });
      lines.push({ text: quoted(written) });
    }
  }
  notNumbersTotal = notNumbers;
  notNumbers = 0;

  // What the calculation refuses goes to text as well; what it depended on then shows as not calculated.
  let source = lines.map((l) => l.text).join('\n');
  for (let round = 0; round < 8; round++) {
    const result = evaluateSheet(source);
    const wrong = result.statements.filter((s) => s.status === 'error');
    if (wrong.length === 0) break;
    for (const s of wrong) {
      const i = s.statement.span.line - 1;
      const line = lines[i];
      if (!line || line.text.startsWith('"')) continue;
      const code = s.diagnostics.find((d) => d.severity === 'error')?.code ?? '';
      // A name that is not known yet says only that its source was left out: not worth a report of its own.
      left.push({ written: line.written ?? line.text, why: { kind: 'error', code } });
      lines[i] = { text: quoted(line.written ?? line.text), written: line.written ?? line.text };
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
    const statement = result.statements.find((s) => s.statement.span.line === i + 1);
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
  const asText = new Set(left.map((l) => l.written));
  const converted = lines.filter((l) => l.written !== undefined && !l.text.startsWith('"') && !asText.has(l.written)).length;
  return { source: `${source}\n`, report: { formulas, converted, texts, left, renamed, agree, differ, notCompared } };
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
