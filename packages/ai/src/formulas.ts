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

/** What the model is asked, with the picture. In English, as all instructions to models. */
export function formulaPrompt(): string {
  return [
    'The image is a formula cut out of an engineering textbook. Write it in the Kalketa calculation language and nothing else: no code block, no LaTeX, no explanation.',
    '- One line per formula. A definition as `name := expression`; an equality that is not a definition as `left == right`.',
    '- Operators + - · / ^ and parentheses; subscripts with an underscore (M_max, R_A); Greek letters as they are (σ, π); functions as sqrt(x), sin(x).',
    '- Leave out the number of the formula, like (51), and any words around it.',
    '- If the image holds no formula, answer: none',
  ].join('\n');
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
 * One line as the calculation language has it: LaTeX converted, the end of a
 * sentence and a formula number left out, "y = expression" made a definition and
 * further equalities of a chain comparisons: "M = R_A·a = R_B·b" →
 * "M := R_A·a" and "R_A·a == R_B·b".
 */
export function toKalk(line: string): string[] {
  let text = line.replace(/^\s*(\$\$?|\\\[|\\\()\s*|\s*(\$\$?|\\\]|\\\))\s*$/g, '').trim();
  if (/\\[A-Za-z]|[{}]/.test(text)) text = latexToKalk(text);
  text = text
    .replace(/\s*\(\d{1,3}\)\s*$/, '')
    .replace(/[.,;]\s*$/, '')
    .replace(/\s*·\s*/g, '·')
    .trim();
  if (text === '' || /≤|≥|<|>|≠/.test(text)) return text ? [text] : [];
  // "y := a == b == c" (the model mixed both) is read as the chain "y = a = b = c".
  const parts = text.split(/\s*(?::=|==|=)\s*/);
  if (parts.length < 2 || parts.some((p) => p === '')) return [text];
  const [left, ...rest] = parts;
  // A name, or a function with its parameters ("M_o(x)"), is defined; anything else is compared.
  const defined = /^[\p{L}][\p{L}\p{N}_]*(\([\p{L}\p{N}_,\s]*\))?$/u.test(left!);
  const lines = [defined ? `${left} := ${rest[0]}` : `${left} == ${rest[0]}`];
  for (let i = 1; i < rest.length; i++) lines.push(`${rest[i - 1]} == ${rest[i]}`);
  return lines;
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
