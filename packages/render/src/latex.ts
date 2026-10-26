/**
 * Formulas of the calculation as LaTeX, for "Copy as LaTeX": Word takes it in
 * its equation editor, a thesis in its source. The same layout tree as on the
 * page, so the copy looks as the printout: fractions, roots, indices, units
 * upright, the braces of a condition, a result in its frame.
 */

import type { EquationLine, PrintBlock } from './model.js';
import type { MathNode } from './math.js';

const GREEK: Readonly<Record<string, string>> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'varepsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', ς: 'varsigma', τ: 'tau', υ: 'upsilon', φ: 'varphi', χ: 'chi', ψ: 'psi', ω: 'omega',
  Γ: 'Gamma', Δ: 'Delta', Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
};

const SYMBOLS: Readonly<Record<string, string>> = {
  '·': '\\cdot', '−': '-', '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '±': '\\pm', '≐': '\\doteq', '≈': '\\approx', '→': '\\to', '⇒': '\\Rightarrow',
  '∧': '\\land', '∨': '\\lor', '∞': '\\infty', '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '∂': '\\partial', '°': '^{\\circ}', '%': '\\%', '‰': '‰',
  '∈': '\\in', '∉': '\\notin', 'ℝ': '\\mathbb{R}', 'ℂ': '\\mathbb{C}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', '√': '\\surd', '∛': '\\sqrt[3]{}',
  '{': '\\{', '}': '\\}', '#': '\\#', '&': '\\&', '$': '\\$', '_': '\\_', '…': '\\ldots', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '|': '|',
};

const SUPERSCRIPTS: Readonly<Record<string, string>> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

const ACCENT_COMMANDS: Readonly<Record<string, string>> = { '˙': 'dot', '¨': 'ddot', '^': 'hat', '~': 'tilde' };

/** Letters and signs of math: Greek as its command, signs as theirs. */
function symbols(text: string): string {
  return [...text].map((c) => (GREEK[c] ? `\\${GREEK[c]} ` : (SYMBOLS[c] ? `${SYMBOLS[c]}${/[a-z]$/i.test(SYMBOLS[c]!) ? ' ' : ''}` : c))).join('');
}

/** Words set upright: \mathrm for names and units, \text for words; their own signs escaped. */
function upright(text: string, command: 'mathrm' | 'text'): string {
  // Powers of a unit written as superscripts (m², s⁻¹) as TeX writes them.
  const powered = text.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (p) => `^{${[...p].map((c) => SUPERSCRIPTS[c]).join('')}}`);
  const parts = powered.split(/(\^\{[-\d]+\})/);
  return parts
    .map((part) => {
      if (part.startsWith('^{')) return part;
      if (part === '') return '';
      const inner = [...part.trim()].map((c) => (c === '·' ? '\\cdot ' : c === ' ' ? '\\ ' : GREEK[c] ? `\\${GREEK[c]} ` : (SYMBOLS[c] && c !== '|' && c !== '·' ? SYMBOLS[c] : c))).join('');
      return `\\${command}{${inner}}`;
    })
    .join('');
}

export function toLatex(node: MathNode): string {
  switch (node.k) {
    case 'i':
      return [...node.t].length > 1 ? upright(node.t, 'mathrm') : symbols(node.t);
    case 'n':
      // A decimal comma stays one: {,} keeps TeX from spacing it as punctuation.
      return node.t.replace(/−/g, '-').replace(/,/g, '{,}').replace(/\s/g, '\\,');
    case 'o':
      return symbols(node.t);
    case 'u':
      return upright(node.t, 'mathrm');
    case 'text':
      // A space around a word stays outside it: \text{pro}\ λ.
      return node.t.trim() === '' ? '\\,' : `${/^\s/.test(node.t) ? '\\ ' : ''}${upright(node.t, 'text')}${/\s$/.test(node.t) ? '\\ ' : ''}`;
    case 'row':
      return node.c.map(toLatex).join(' ').replace(/\s+/g, ' ').trim();
    case 'frac':
      return `\\frac{${toLatex(node.n)}}{${toLatex(node.d)}}`;
    case 'sup':
      return `{${toLatex(node.b)}}^{${toLatex(node.e)}}`;
    case 'sub':
      return `{${toLatex(node.b)}}_{${toLatex(node.s)}}`;
    case 'sqrt':
      return `\\sqrt{${toLatex(node.c)}}`;
    case 'root':
      return `\\sqrt[${toLatex(node.i)}]{${toLatex(node.c)}}`;
    case 'table':
      return `\\begin{pmatrix} ${node.rows.map((r) => r.map(toLatex).join(' & ')).join(' \\\\ ')} \\end{pmatrix}`;
    case 'subsup':
      return `{${toLatex(node.b)}}_{${toLatex(node.s)}}^{${toLatex(node.e)}}`;
    case 'underover':
      return `${toLatex(node.b)}\\limits_{${toLatex(node.u)}}^{${toLatex(node.o)}}`;
    case 'paren':
      return `\\left(${toLatex(node.c)}\\right)`;
    case 'vec':
      return `\\vec{${toLatex(node.b)}}`;
    case 'bar':
      return `\\bar{${toLatex(node.b)}}`;
    case 'accent':
      return `\\${ACCENT_COMMANDS[node.a] ?? 'hat'}{${toLatex(node.b)}}`;
    case 'cases':
      return `\\begin{cases} ${node.rows.map(([v, c]) => `${toLatex(v)} & ${toLatex(c)}`).join(' \\\\ ')} \\end{cases}`;
    case 'boxed':
      return `\\boxed{${toLatex(node.c)}}`;
  }
}

/** The steps of a block as one chain: M = \frac{q L^2}{8} = … = 37{,}5\,\mathrm{kN \cdot m}. */
export function equationLatex(lines: readonly EquationLine[], defineOperator = '='): string {
  // A step with a name of its own (the coefficients of a solved equation, its roots) starts a row;
  // rows stand one under another, aligned on their signs.
  const rows: string[][] = [];
  lines.forEach((line, i) => {
    const op = line.op ?? (line.lhs ? defineOperator : i > 0 ? '=' : '');
    const sign = op === ':=' ? '=' : symbols(op);
    const lhs = line.lhs ? `${line.lead ? `${symbols(line.lead)} ` : ''}${toLatex(line.lhs)}` : '';
    if (rows.length === 0 || line.lhs) rows.push([lhs, sign, toLatex(line.rhs)]);
    else rows.at(-1)!.push(sign, toLatex(line.rhs));
  });
  const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
  if (rows.length === 1) return tidy(rows[0]!.join(' '));
  return `\\begin{aligned} ${rows.map(([lhs, ...rest]) => tidy(`${lhs} &${rest.join(' ')}`)).join(' \\\\ ')} \\end{aligned}`;
}

/** A block of the page as LaTeX: an equation or a check; undefined for other blocks. */
export function blockLatex(block: PrintBlock): string | undefined {
  if (block.kind === 'equation') return equationLatex(block.lines);
  if (block.kind === 'check') return block.lines.map((l) => toLatex(l.rhs)).join(' \\Rightarrow ');
  return undefined;
}
