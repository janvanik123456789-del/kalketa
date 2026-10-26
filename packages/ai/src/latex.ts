/**
 * LaTeX math into the calculation language, read by KaTeX: it parses the
 * formula as TeX does and gives its MathML tree, with every command already
 * made the character it prints (\sigma → σ, \leq → ≤, \cdot → ⋅). The tree is
 * then written as a line of the calculation: \frac{a}{b} → a/b,
 * \sqrt[3]{x} → cbrt(x), W_{\text{pl},y} → W_pl_y, 2\pi r → 2·π·r.
 *
 * Formulas come so from a model's answer, from Wikipedia or a thesis pasted
 * into a line. What it cannot write (sums, integrals, matrices) is left to the
 * caller, which then has the text as it came.
 */

import katex from 'katex';

/** A node of KaTeX's MathML tree: an element with its children, or a text. */
interface TreeNode {
  readonly type?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly children?: readonly TreeNode[];
  readonly text?: string;
}

/** What KaTeX does not declare: the tree it builds before it writes it out. */
const renderToDomTree = (katex as unknown as { __renderToDomTree(tex: string, options: object): TreeNode }).__renderToDomTree;

class Unsupported extends Error {}

/** A formula written in LaTeX, or undefined where KaTeX cannot read it or the calculation cannot write it. */
export function latexLine(latex: string): string | undefined {
  let tree: TreeNode;
  try {
    tree = renderToDomTree(latex, { output: 'mathml', throwOnError: true, strict: 'ignore', trust: false, maxExpand: 200 });
  } catch {
    return undefined;
  }
  // span > math > semantics > [mrow, annotation]: the annotation is the source again.
  const semantics = tree.children?.[0]?.children?.[0];
  const body = semantics?.children?.filter((c) => c.type !== 'annotation') ?? [];
  try {
    return tidy(rowText(body));
  } catch (e) {
    if (e instanceof Unsupported) return undefined;
    throw e;
  }
}

/** A piece of a row, and what it is for joining it with its neighbours. */
interface Piece {
  readonly text: string;
  readonly kind: 'factor' | 'number' | 'op' | 'rel' | 'func' | 'open' | 'close' | 'unit' | 'bar';
}

/** Characters of operators as the language writes them; an empty one is left out. */
const OPERATORS: Readonly<Record<string, string>> = {
  '⋅': '·', '×': '·', '∗': '·', '∙': '·', '·': '·', '−': '-', '÷': '/', '⁡': '', '⁢': '', '∣': '|', '≈': '≐',
};
const RELATIONS = new Set(['=', '≤', '≥', '<', '>', '≠', '≐', ':']);
/** Function names as TeX prints them, as the language has them. */
const FUNCTIONS: Readonly<Record<string, string>> = { log: 'log10', lg: 'log10', arctg: 'atan', arcsin: 'asin', arccos: 'acos', arctan: 'atan', cotg: 'cot' };
/** Marks TeX sets over a letter, as the combining characters a name writes after it. */
const MARKS: Readonly<Record<string, string>> = { '˙': '̇', '¨': '̈', '^': '̂', 'ˆ': '̂', '~': '̃', '˜': '̃' };
/** Variant letters of TeX, the letters the language has. */
const LETTERS: Readonly<Record<string, string>> = { 'ϵ': 'ε', 'ϕ': 'φ', 'ϑ': 'θ', 'ϱ': 'ρ', 'ς': 'σ', 'ϖ': 'π' };

function textOf(node: TreeNode): string {
  if (node.text !== undefined && node.type === undefined) return node.text;
  return (node.children ?? []).map(textOf).join('');
}

function letters(text: string): string {
  return [...text].map((c) => LETTERS[c] ?? c).join('');
}

/** The children of a row, groups without a meaning of their own (a function with its mark) opened. */
function flat(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => (n.type === undefined && n.text === undefined ? flat(n.children ?? []) : n.type === 'mstyle' || n.type === 'mpadded' ? flat(n.children ?? []) : [n]));
}

function rowText(nodes: readonly TreeNode[]): string {
  const pieces: Piece[] = [];
  const all = flat(nodes);
  for (let i = 0; i < all.length; i++) {
    const node = all[i]!;
    const next = all[i + 1];
    // A function: its name, then its argument in parentheses (sin α → sin(α); sin(α) stays).
    if (node.type === 'mi' && next?.type === 'mo' && textOf(next) === '⁡') {
      const name = textOf(node);
      const after = all[i + 2];
      i++;
      if (after && !(after.type === 'mo' && textOf(after) === '(')) {
        pieces.push({ text: `${FUNCTIONS[name] ?? name}(${nodeText(after)})`, kind: 'factor' });
        i++;
      } else pieces.push({ text: FUNCTIONS[name] ?? name, kind: 'func' });
      continue;
    }
    pieces.push(piece(node));
  }
  return join(pieces);
}

function piece(node: TreeNode): Piece {
  switch (node.type) {
    case 'mn':
      return { text: textOf(node), kind: 'number' };
    case 'mi': {
      const text = letters(textOf(node));
      if (text === '∣') return { text: '|', kind: 'bar' };
      // A word set upright after a number (\mathrm{kN}) is its unit.
      return { text, kind: text.length > 1 && node.attributes?.mathvariant === 'normal' ? 'unit' : 'factor' };
    }
    case 'mtext':
      return { text: textOf(node).trim(), kind: 'unit' };
    case 'mspace':
      return { text: '', kind: 'op' };
    case 'mo': {
      const raw = textOf(node);
      const text = OPERATORS[raw] ?? raw;
      if (text === '|') return { text, kind: 'bar' };
      if (text === '(' || text === '[') return { text: '(', kind: 'open' };
      if (text === ')' || text === ']') return { text: ')', kind: 'close' };
      return { text, kind: RELATIONS.has(text) ? 'rel' : 'op' };
    }
    default:
      return { text: nodeText(node), kind: 'factor' };
  }
}

/** One node as a part of a line: a fraction, a power, a root, a group. */
function nodeText(node: TreeNode): string {
  const c = node.children ?? [];
  switch (node.type) {
    case 'mrow':
      return rowText(c);
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
      return piece(node).text;
    case 'mfrac':
      return `${grouped(nodeText(c[0]!), false)}/${grouped(nodeText(c[1]!), true)}`;
    case 'msqrt':
      return `sqrt(${rowText(c)})`;
    case 'mroot': {
      const index = nodeText(c[1]!);
      return index === '3' ? `cbrt(${nodeText(c[0]!)})` : index === '2' ? `sqrt(${nodeText(c[0]!)})` : `root(${nodeText(c[0]!)}, ${index})`;
    }
    case 'msub':
      return `${nodeText(c[0]!)}_${subscript(c[1]!)}`;
    case 'msup':
      return power(c[0]!, c[1]!);
    case 'msubsup':
      return power({ type: 'msub', children: [c[0]!, c[1]!] }, c[2]!);
    case 'mover': {
      // An arrow over a name makes it a vector (F⃗); a dot, two dots, a hat or a tilde stays over its letter (ẋ),
      // as the name is written; a bar over it is left out.
      const mark = textOf(c[1]!);
      const combining = MARKS[mark];
      return mark === '⃗' || mark === '→' ? `${nodeText(c[0]!)}⃗` : combining && /^\p{L}$/u.test(nodeText(c[0]!)) ? `${nodeText(c[0]!)}${combining}` : nodeText(c[0]!);
    }
    case 'mstyle':
    case 'mpadded':
      return rowText(c);
    case 'mphantom':
      return '';
    default:
      throw new Unsupported(node.type);
  }
}

/** The power of a base: e^x → exp(x); x^2, x^(n+1); a group base keeps its parentheses. */
function power(base: TreeNode, exponent: TreeNode): string {
  const e = nodeText(exponent);
  if (e === '′' || e === "'") return `${nodeText(base)}'`;
  if (base.type === 'mi' && textOf(base) === 'e' && base.attributes?.mathvariant === 'normal') return `exp(${e})`;
  const b = nodeText(base);
  return `${base.type === 'mrow' || base.type === 'mfrac' ? grouped(b, true) : b}^${/^[\p{L}\p{N}.]+$/u.test(e) ? e : `(${e})`}`;
}

/** A subscript as the language writes it: its parts after underscores (W_{pl,y} → pl_y). */
function subscript(node: TreeNode): string {
  return textOf(node).replace(/\s+/g, '').replace(/[,;]/g, '_');
}

/** A part in parentheses where it would otherwise not stay together: a sum, a product under a fraction. */
function grouped(text: string, strict: boolean): string {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (/[+\-=<>≤≥≠ ]/.test(ch) || (strict && /[·/]/.test(ch)))) return `(${text})`;
  }
  return text;
}

/** The pieces of a row joined: a product where two factors meet, spaces around relations and sums. */
function join(pieces: readonly Piece[]): string {
  let out = '';
  let last: Piece | undefined;
  let bars = 0;
  for (const p of pieces) {
    if (p.text === '' && p.kind === 'op') continue;
    if (p.kind === 'bar') {
      // |x| is the absolute value: the first bar opens it, the second closes it.
      const opening = bars % 2 === 0;
      bars++;
      if (opening && last && isFactor(last)) out += '·';
      out += opening ? 'abs(' : ')';
      last = { text: '', kind: opening ? 'open' : 'close' };
      continue;
    }
    if (p.kind === 'unit') {
      out += last?.kind === 'number' ? ` ${p.text}` : last && isFactor(last) ? `·${p.text}` : p.text;
    } else if (p.kind === 'rel') {
      out += ` ${p.text} `;
    } else if (p.kind === 'op') {
      const unary = !last || last.kind === 'op' || last.kind === 'rel' || last.kind === 'open';
      out += (p.text === '+' || p.text === '-' || p.text === '±') && !unary ? ` ${p.text} ` : p.text;
    } else if (p.kind === 'open') {
      // f(x) is a call; 2(a+b) and (a+b)(c+d) are products.
      if (last && (last.kind === 'number' || last.kind === 'close' || last.kind === 'unit')) out += '·';
      out += p.text;
    } else {
      if (last && (isFactor(last) || last.kind === 'close') && p.kind !== 'close') out += '·';
      out += p.text;
    }
    last = p;
  }
  return out;
}

function isFactor(p: Piece): boolean {
  return p.kind === 'factor' || p.kind === 'number' || p.kind === 'unit';
}

/** Spaces as the language writes them: none doubled, ":=" together. */
function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/ : = /g, ' := ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
}
