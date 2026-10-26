/**
 * Formulas read from pictures (docs/01-filozofie.md, ch. 9.6): a cut-out of a
 * formula from a textbook is written by a model that reads images in the
 * calculation language, so the sources hold it as a formula the program can
 * typeset and check, not only as a picture. The user reviews what it wrote.
 *
 * Models often answer in LaTeX ($$y = \frac{5 \cdot Q \cdot l^{3}}{384 \cdot E \cdot I}$$)
 * or as a plain equation ("M = R_A · a = R_B · b."), however they are asked;
 * both are brought into the calculation language here.
 */

import { latexLine } from './latex.js';

/** What the model is asked, with the picture. In English, as all instructions to models. */
export function formulaPrompt(): string {
  return [
    'The image is a formula cut out of an engineering textbook. Write it in the Kalketa calculation language and nothing else: no code block, no LaTeX, no explanation.',
    '- One line per formula. A definition as `name := expression`; an equality that is not a definition as `left == right`.',
    '- A chain of equal forms (a derivation, y = a = b = c) stays one line: `derive y := a == b == c`, or `derive a == b == c` when it starts with no name. Do not split it.',
    '- Operators + - · / ^ and parentheses; subscripts with an underscore (M_max, R_A), a subscript of several parts with more underscores (τ_Sk_s for τ with Sk,s below); Greek letters as they are (σ, π); functions as sqrt(x), sin(x), tg(x), always with parentheses.',
    '- If the formula has a number at its right, like (32), end the line with {eq=32}. Leave out any words around the formula.',
    '- If the image holds no formula, answer: none',
  ].join('\n');
}

/** How much of the text around a figure goes with it: enough for its subject, not a chapter. */
export const FIGURE_CONTEXT_CHARS = 3000;

/**
 * What the model is asked about a figure of the sources: a description in a few sentences,
 * read with the text around the figure (what the book says before and after it, its caption
 * like "Obr. 25 Prostý smyk"), so it names the subject as the book does, not only what it
 * looks like. Written in the language of that text (of the user without it). A cut-out of
 * a formula is no figure: the answer is then "formula".
 */
export function figurePrompt(language: string, context = ''): string {
  return [
    'The image is a figure from an engineering textbook. Below is the text of the book around it.',
    `Write in the language of the text around the figure (in ${language} when there is none), 2 to 4 sentences:`,
    '1. what the figure shows and its subject as the book names it (the figure number and title when the text gives them, e.g. "Obr. 25 Prostý smyk");',
    '2. what is drawn: the body or structure, the loads and quantities with their symbols (F, the sections I and II, …), and what the figure explains;',
    '3. how it relates to the text (which effect, condition or formula it illustrates).',
    '- Plain sentences, no list, no quotation marks or braces, no "The image shows". Only what the image and the text support; do not invent values.',
    '- If the image holds only a formula or text, answer: formula',
    '',
    'Text around the figure:',
    context.trim().slice(0, FIGURE_CONTEXT_CHARS) || '(none)',
  ].join('\n');
}

/** The description of a figure from the model's answer; undefined when it is no figure. */
export function cleanFigureDescription(answer: string): string | undefined {
  const text = answer
    .replace(/^\s*```[\w-]*\s*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((l) => l !== '')
    .join(' ');
  if (!text || /^formula\.?$/i.test(text)) return undefined;
  // Kept to what the attribute holds: no quotes or braces, one line, a few sentences.
  const clean = text.replace(/["{}]/g, '').replace(/^(the image shows|obrázek ukazuje|na obrázku je)\s*/i, '').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 700) : undefined;
}

const GREEK: Readonly<Record<string, string>> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

/** The group in braces starting at `at` (an opening brace): its content and where it ends. */
function group(text: string, at: number): { inner: string; end: number } | undefined {
  if (text[at] !== '{') return undefined;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return { inner: text.slice(at + 1, i), end: i + 1 };
  }
  return undefined;
}

/** LaTeX math as the calculation language writes it: \frac{a}{b} → (a)/(b), \cdot → ·, x^{3} → x^3, \sigma → σ. */
export function latexToKalk(latex: string): string {
  let text = latex;
  // \frac and \sqrt hold groups that may hold more of them: innermost first, until none is left.
  for (let guard = 0; guard < 50; guard++) {
    const frac = /\\[dt]?frac\s*(?=\{)/.exec(text);
    const root = /\\sqrt\s*(?=\{)/.exec(text);
    const next = [frac, root].filter((m): m is RegExpExecArray => !!m).sort((a, b) => a.index - b.index)[0];
    if (!next) break;
    const start = next.index + next[0].length;
    const first = group(text, start);
    if (!first) break;
    if (next === frac) {
      const second = group(text, first.end);
      if (!second) break;
      text = `${text.slice(0, next.index)}(${first.inner})/(${second.inner})${text.slice(second.end)}`;
    } else {
      text = `${text.slice(0, next.index)}sqrt(${first.inner})${text.slice(first.end)}`;
    }
  }
  return text
    .replace(/\\left|\\right|\\displaystyle|\\mathrm|\\mathit|\\text|\\operatorname/g, '')
    .replace(/\\(?:cdot|times|ast)/g, '·')
    .replace(/\\(?:leq|le)\b/g, '≤')
    .replace(/\\(?:geq|ge)\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\([A-Za-z]+)/g, (whole, name: string) => GREEK[name] ?? (['sin', 'cos', 'tan', 'ln', 'log', 'exp'].includes(name) ? name : whole))
    .replace(/\\[,;:! ]/g, ' ')
    // A power or index of one group: x^{3} → x^3, x^{n+1} → x^(n+1), R_{A} → R_A.
    .replace(/\^\{([^{}]*)\}/g, (_, e: string) => (/^[\w.]+$/.test(e.trim()) ? `^${e.trim()}` : `^(${e.trim()})`))
    .replace(/_\{([^{}]*)\}/g, (_, s: string) => `_${s.replace(/\s+/g, '')}`)
    .replace(/[{}]/g, '')
    .replace(/\s*·\s*/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A subscript of several parts as the book writes it, τ_Sk,s: the language reads
 * underscores (τ_Sk_s, typeset τ with Sk,s below). Commas inside brackets separate
 * arguments and stay.
 */
function subscriptParts(text: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    const inSubscript = /_[\p{L}\p{N}]+$/u.test(out) && /[\p{L}\p{N}]/u.test(text[i + 1] ?? '');
    out += ch === ',' && depth === 0 && inSubscript ? '_' : ch;
  }
  return out;
}

/**
 * One line as the calculation language has it: LaTeX converted, the end of a
 * sentence left out, the number of the formula kept for its place at the right
 * ((32) → {eq=32}), "y = expression" made a definition, a chain of equalities
 * kept as one derivation of theory, checked step by step:
 * "M = R_A·a = R_B·b" → "derive M := R_A·a == R_B·b".
 */
export function toKalk(line: string): string[] {
  let text = line.replace(/^\s*(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))\s*$/g, '').trim();
  // The number, as asked ({eq=32}) or as printed ((32)).
  let number: string | undefined;
  const asked = /\s*\{eq=([\p{L}\p{N}_]+)\}\s*$/u.exec(text);
  if (asked) {
    number = asked[1];
    text = text.slice(0, asked.index);
  }
  const lines = toKalkLines(text, (printed) => (number ??= printed));
  return number && lines.length > 0 ? [...lines.slice(0, -1), `${lines.at(-1)} {eq=${number}}`] : lines;
}

function toKalkLines(line: string, numbered: (printed: string) => void): string[] {
  let text = line;
  // Written as asked already: "derive y := a == b == c".
  const derived = /^derive\s+/.exec(text);
  if (derived) text = text.slice(derived[0].length);
  // The number of the formula first: in LaTeX it would be read as a factor.
  text = text.replace(/[.,;]?\s*\((\d{1,3}[a-z]?)\)\s*$/, (_, n: string) => (numbered(n), ''));
  if (/\\[A-Za-z]|[{}]/.test(text)) text = latexLine(text) ?? latexToKalk(text);
  // Decimal commas as the book prints them (0,6·σ_Kt; 1,5): the language writes a point.
  text = text.replace(/(\d),(\d)/g, '$1.$2');
  // A function the book writes without parentheses: tg γ, sin α_1.
  text = text.replace(/(?<![\p{L}\p{N}_])(sin|cos|tan|tg|cot|cotg|ln)\s+([\p{L}][\p{L}\p{N}_]*)/gu, '$1($2)');
  text = subscriptParts(
    text
      .replace(/[.,;]\s*$/, '')
      .replace(/\s*·\s*/g, '·')
      .trim(),
  );
  if (text === '' || /≤|≥|<|>|≠/.test(text)) return text ? [text] : [];
  // "y := a == b == c" (the model mixed both) is read as the chain "y = a = b = c".
  // The members and what joins them: = (or := and ==), or ≐ (≈) where the book rounds.
  const pieces = text.split(/\s*(:=|==|≐|≈|=)\s*/);
  const parts = pieces.filter((_, i) => i % 2 === 0);
  const joins = pieces.filter((_, i) => i % 2 === 1).map((j) => (j === '≐' || j === '≈' ? '≐' : '=='));
  if (parts.length < 2 || parts.some((p) => p === '')) return [text];
  const [left, ...rest] = parts;
  // A name, or a function with its parameters ("M_o(x)"), is defined; anything else is compared.
  const defined = /^[\p{L}][\p{L}\p{N}_]*(\([\p{L}\p{N}_,\s]*\))?$/u.test(left!);
  const rounded = joins.includes('≐');
  if (rest.length === 1 && !derived && !rounded) return [defined ? `${left} := ${rest[0]}` : `${left} == ${rest[0]}`];
  // A chain (or what came as derive, or a rounded result): one derivation of theory, its names symbols without values.
  const chain = rest.map((member, i) => (i === 0 ? member : `${joins[i]} ${member}`)).join(' ');
  return [defined && joins[0] !== '≐' ? `derive ${left} := ${chain}` : `derive ${left} ${joins[0]} ${chain}`];
}

/** Text that is LaTeX math: a command (\frac, \sigma), a group as an index or power, or $ around it. A path (C:\Users) is not. */
export function looksLikeLatex(text: string): boolean {
  return /\\[A-Za-z]{2,}|[_^]\{|^\s*(\$|\\\[|\\\()/.test(text) && !/[A-Za-z]:\\|\\\\[A-Za-z]+\\/.test(text);
}

/**
 * LaTeX pasted into a line (from Wikipedia, a thesis, an answer of a model), as lines of the
 * calculation: one per formula, the rows of an aligned group (\\) each its own. Undefined
 * for text that is no LaTeX: it is pasted as it is.
 */
export function latexPaste(text: string): string[] | undefined {
  if (!looksLikeLatex(text)) return undefined;
  const lines = text
    .replace(/\\(begin|end)\{[^}]*\}/g, '\n')
    .replace(/\$\$|\\\[|\\\]/g, '\n')
    .split(/\\\\|\r?\n/)
    .map((l) => l.replace(/&/g, '').trim())
    .filter((l) => l !== '');
  const out = lines.flatMap(toKalk);
  return out.length > 0 ? out : undefined;
}

/** The lines of the model's answer in the calculation language; undefined when it found no formula. */
export function cleanFormula(answer: string): string[] | undefined {
  const lines = answer
    .replace(/^\s*```[\w-]*\s*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0 || (lines.length === 1 && /^none\.?$/i.test(lines[0]!))) return undefined;
  const out = lines.flatMap(toKalk);
  return out.length > 0 ? out : undefined;
}

/**
 * What the model is asked about a part of a scanned page: its text written again from the
 * picture, the text the scan's recognition (OCR) read given as a hint. The recognition reads
 * Greek letters, indexes and formulas wrongly (σ as "<r", τ as "T", γ as "y", Δl as "AI");
 * the model sees what is printed.
 */
export function rereadPrompt(ocr: string): string {
  return [
    'The image is a part of a scanned page of an engineering textbook. Below is the text the scan recognition (OCR) read from it; it has errors, above all in Greek letters, indexes and formulas.',
    'Write the text of the image again exactly as printed, in its own language:',
    '- the same words in the same order; correct only what the recognition read wrongly;',
    '- Greek letters as Greek (σ, τ, γ, Δ), an index with an underscore (σ_Kt, K_I, τ_Dov_s), multiplication as ·, numbers as printed (0,6);',
    '- a formula inside a sentence written on its line in the sentence (τ_Ks = 0,6·σ_Kt = 0,6·170 = 102 MPa);',
    '- paragraphs separated by one blank line; a word divided at the end of a line written whole;',
    '- no comments, no headings marks, no code blocks, no page numbers or running heads.',
    '',
    'Text from the recognition:',
    ocr.trim().slice(0, 6000),
  ].join('\n');
}

/** The text of the model's answer, as paragraphs; undefined when there is none. */
export function cleanReread(answer: string): string | undefined {
  const text = answer
    .replace(/^\s*```[\w-]*\s*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}
