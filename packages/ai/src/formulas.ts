/**
 * Formulas read from pictures (docs/01-filozofie.md, ch. 9.6): a cut-out of a
 * formula from a textbook is written by a model that reads images in the
 * calculation language, so the sources hold it as a formula the program can
 * typeset and check, not only as a picture. The user reviews what it wrote.
 */

/** What the model is asked, with the picture. In English, as all instructions to models. */
export function formulaPrompt(): string {
  return [
    'The image is a formula cut out of an engineering textbook. Write it in the Kalketa calculation language and nothing else: no code block, no explanation.',
    '- One line per formula. A definition as `name := expression`; an equality that is not a definition as `left == right`.',
    '- Operators + - · / ^ and parentheses; subscripts with an underscore (M_max, R_A); Greek letters as they are (σ, π); functions as sqrt(x), sin(x).',
    '- Leave out the number of the formula, like (51), and any words around it.',
    '- If the image holds no formula, answer: none',
  ].join('\n');
}

/** The lines of the model's answer, without a code block around them; undefined when it found no formula. */
export function cleanFormula(answer: string): string[] | undefined {
  const lines = answer
    .replace(/^\s*```[\w-]*\s*$/gm, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length === 0 || (lines.length === 1 && /^none\.?$/i.test(lines[0]!))) return undefined;
  return lines;
}
