/**
 * A small math layout tree, serialized to MathML (native in browsers, used
 * for print and PDF) or to linear text (tests, terminal).
 *
 * Mathematics is never stored as a picture (docs, rendering rule 41).
 */

export type MathNode =
  /** Identifier; `normal` = upright (multi-letter names, function names). */
  | { readonly k: 'i'; readonly t: string; readonly normal?: boolean }
  /** Number, already formatted for the locale. */
  | { readonly k: 'n'; readonly t: string }
  | { readonly k: 'o'; readonly t: string }
  /** Unit symbol, always upright. */
  | { readonly k: 'u'; readonly t: string }
  | { readonly k: 'text'; readonly t: string }
  | { readonly k: 'row'; readonly c: readonly MathNode[] }
  | { readonly k: 'frac'; readonly n: MathNode; readonly d: MathNode }
  | { readonly k: 'sup'; readonly b: MathNode; readonly e: MathNode }
  | { readonly k: 'sub'; readonly b: MathNode; readonly s: MathNode }
  | { readonly k: 'sqrt'; readonly c: MathNode }
  /** A root with its index: ∛x, ⁿ√x. */
  | { readonly k: 'root'; readonly c: MathNode; readonly i: MathNode }
  /** Base with limits beside it: ∫ from a to b. */
  | { readonly k: 'subsup'; readonly b: MathNode; readonly s: MathNode; readonly e: MathNode }
  /** Rows of cells: the inside of a matrix. */
  | { readonly k: 'table'; readonly rows: readonly (readonly MathNode[])[] }
  /** Base with limits under and over it: ∑ from k = 1 to n. */
  | { readonly k: 'underover'; readonly b: MathNode; readonly u: MathNode; readonly o: MathNode }
  | { readonly k: 'paren'; readonly c: MathNode }
  /** A vector: an arrow over the name with its index, p⃗₁. */
  | { readonly k: 'vec'; readonly b: MathNode }
  /** A bar over a name: the arithmetic mean t̄. */
  | { readonly k: 'bar'; readonly b: MathNode };

export const mi = (t: string, normal = false): MathNode => (normal ? { k: 'i', t, normal } : { k: 'i', t });
export const mn = (t: string): MathNode => ({ k: 'n', t });
export const mo = (t: string): MathNode => ({ k: 'o', t });
export const mu = (t: string): MathNode => ({ k: 'u', t });
export const mtext = (t: string): MathNode => ({ k: 'text', t });
export const row = (...c: MathNode[]): MathNode => ({ k: 'row', c });
export const frac = (n: MathNode, d: MathNode): MathNode => ({ k: 'frac', n, d });
export const sup = (b: MathNode, e: MathNode): MathNode => ({ k: 'sup', b, e });
export const sub = (b: MathNode, s: MathNode): MathNode => ({ k: 'sub', b, s });
export const sqrt = (c: MathNode): MathNode => ({ k: 'sqrt', c });
export const nroot = (c: MathNode, i: MathNode): MathNode => ({ k: 'root', c, i });
export const subsup = (b: MathNode, s: MathNode, e: MathNode): MathNode => ({ k: 'subsup', b, s, e });
export const table = (rows: readonly (readonly MathNode[])[]): MathNode => ({ k: 'table', rows });
export const underover = (b: MathNode, u: MathNode, o: MathNode): MathNode => ({ k: 'underover', b, u, o });
export const paren = (c: MathNode): MathNode => ({ k: 'paren', c });
export const vec = (b: MathNode): MathNode => ({ k: 'vec', b });
export const bar = (b: MathNode): MathNode => ({ k: 'bar', b });

/** The combining arrow written after a letter of a name (p⃗_1): the name is a vector. */
export const VECTOR_ARROW = '⃗';

/**
 * A variable name as printed: the first "_" starts a subscript (Calcpad);
 * one-letter parts are italic, longer ones upright. "M_Ed" -> M with subscript Ed.
 * An arrow written after a letter makes it a vector: "p⃗_1" -> p₁ with an arrow over both.
 */
export function nameNode(name: string): MathNode {
  if (name.includes(VECTOR_ARROW)) return vec(nameNode(name.replaceAll(VECTOR_ARROW, '')));
  const at = name.indexOf('_');
  const part = (text: string): MathNode => (/^\d+$/.test(text) ? mn(text) : mi(text, [...text].length > 1));
  if (at <= 0 || at === name.length - 1) return part(name);
  return sub(part(name.slice(0, at)), part(name.slice(at + 1).replaceAll('_', ',')));
}

export function toMathML(node: MathNode, display: 'block' | 'inline' = 'inline'): string {
  return `<math display="${display}">${ml(node)}</math>`;
}

function ml(node: MathNode): string {
  switch (node.k) {
    case 'i':
      return node.normal ? `<mi mathvariant="normal">${esc(node.t)}</mi>` : `<mi>${esc(node.t)}</mi>`;
    case 'n':
      return `<mn>${esc(node.t)}</mn>`;
    case 'o':
      return `<mo>${esc(node.t)}</mo>`;
    case 'u':
      // Thin space between a number and its unit is added by the caller.
      return `<mi mathvariant="normal" class="unit">${esc(node.t)}</mi>`;
    case 'text':
      return `<mtext>${esc(node.t)}</mtext>`;
    case 'row':
      return `<mrow>${node.c.map(ml).join('')}</mrow>`;
    case 'frac':
      return `<mfrac>${ml(node.n)}${ml(node.d)}</mfrac>`;
    case 'sup':
      return `<msup>${ml(node.b)}${ml(node.e)}</msup>`;
    case 'sub':
      return `<msub>${ml(node.b)}${ml(node.s)}</msub>`;
    case 'sqrt':
      return `<msqrt>${ml(node.c)}</msqrt>`;
    case 'root':
      return `<mroot>${ml(node.c)}${ml(node.i)}</mroot>`;
    case 'table':
      return `<mtable>${node.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${ml(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
    case 'subsup':
      return `<msubsup>${ml(node.b)}${ml(node.s)}${ml(node.e)}</msubsup>`;
    case 'underover':
      return `<munderover>${ml(node.b)}${ml(node.u)}${ml(node.o)}</munderover>`;
    case 'paren':
      return `<mrow><mo>(</mo>${ml(node.c)}<mo>)</mo></mrow>`;
    case 'vec':
      return `<mover>${ml(node.b)}<mo stretchy="false">→</mo></mover>`;
    case 'bar':
      return `<mover accent="true">${ml(node.b)}<mo stretchy="false">¯</mo></mover>`;
  }
}

/** Linear text form: "M_Ed = (q·L^2)/8". Used in tests and plain-text output. */
export function toText(node: MathNode): string {
  switch (node.k) {
    case 'i':
    case 'n':
    case 'o':
    case 'u':
    case 'text':
      return node.t;
    case 'row':
      return node.c.map(toText).join('');
    case 'frac':
      return `${wrapText(node.n)}/${wrapText(node.d)}`;
    case 'sup':
      return `${wrapText(node.b)}^${wrapText(node.e)}`;
    case 'sub':
      return `${toText(node.b)}_${toText(node.s)}`;
    case 'sqrt':
      return `√(${toText(node.c)})`;
    case 'root':
      return toText(node.i) === '3' ? `∛(${toText(node.c)})` : `root(${toText(node.c)}, ${toText(node.i)})`;
    case 'table':
      return node.rows.map((r) => r.map(toText).join(', ')).join(' | ');
    case 'subsup':
    case 'underover':
      return `${toText(node.b)}[${toText(node.k === 'subsup' ? node.s : node.u)}..${toText(node.k === 'subsup' ? node.e : node.o)}]`;
    case 'paren':
      return `(${toText(node.c)})`;
    case 'vec':
      return `vec(${toText(node.b)})`;
    case 'bar':
      return `${toText(node.b)}\u0304`;
  }
}

function wrapText(node: MathNode): string {
  const text = toText(node);
  const simple = node.k === 'i' || node.k === 'n' || node.k === 'u' || node.k === 'paren' || node.k === 'sub' || node.k === 'sqrt' || node.k === 'root';
  return simple ? text : `(${text})`;
}

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
