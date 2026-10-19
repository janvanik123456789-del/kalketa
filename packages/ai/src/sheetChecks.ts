/**
 * The check of the sheet an answer proposes, before anything else: the program evaluates the sheet
 * with the changes put in, and what they break (a name defined twice, an integral that did not
 * converge) or what the text claims without the sheet computing it (a number in prose) goes back
 * to the model, as a check in Python does.
 */

/** A problem the proposed sheet has and the present one does not: the line and what the program says of it. */
export interface SheetProblem {
  readonly line: string;
  readonly message: string;
  /** Its code (E-DERIVE-STEP…): some get a word of advice in the report. */
  readonly code?: string;
}

/** A number in the text of the proposed lines that no value of the sheet and no given number explains. */
export interface LoneNumber {
  readonly number: string;
  readonly line: string;
}

export interface SheetCheck {
  readonly problems: readonly SheetProblem[];
  readonly numbers: readonly LoneNumber[];
  /** Lines of Python written into the sheet (they belong in a python block). */
  readonly python?: readonly string[];
  /** Checks of the sheet that pass no more (or newly written ones that do not): the line and its label. */
  readonly failed?: readonly { readonly line: string; readonly label: string }[];
}

/** The words of the report, in the user's language (the model reads them too). */
export interface SheetWords {
  readonly title: string;
  readonly problems: string;
  readonly numbers: string;
  readonly ask: string;
  /** Said first when the change block holds Python. */
  readonly python: string;
  /** Said before the checks that do not pass. */
  readonly failed: string;
  /** Advice by the code of a problem, said once after the problems. */
  readonly hints: Readonly<Record<string, string>>;
}

/** Small whole numbers (counts, "2×", powers) are said in text without a calculation. */
const SMALL = 10;
/** How close a number in text must be to a value to be that value rounded ("~4000×", "52,7 min"). */
const TOLERANCE = 0.03;
/** Factors a value is shown with in another unit: powers of ten (mm, kN, %) and of sixty (min, h). */
const SCALES = [1, 60, 3600, 1 / 60, 1 / 3600].flatMap((s) => Array.from({ length: 19 }, (_, i) => s * 10 ** (i - 9)));

/** The numbers written in a text: 6,3 and 6.3, 3 159 and 3 159,5; not the digits of names (h_1, T8, R2). */
export function numbersIn(text: string): { readonly text: string; readonly value: number }[] {
  const found: { text: string; value: number }[] = [];
  for (const m of text.matchAll(/(?<![\p{L}_\d.,])\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?(?![\p{L}_\d])|(?<![\p{L}_\d.,])\d+(?:[.,]\d+)?(?![\p{L}_\d])/gu)) {
    const value = Number(m[0].replace(/[  ]/g, '').replace(',', '.'));
    if (Number.isFinite(value)) found.push({ text: m[0], value });
  }
  return found;
}

/** Whether a number is a value rounded, possibly in another unit. */
function explains(number: number, value: number): boolean {
  if (value === 0 || !Number.isFinite(value)) return number === 0;
  const ratio = number / Math.abs(value);
  return SCALES.some((s) => Math.abs(ratio * s - 1) <= TOLERANCE);
}

/**
 * The numbers in the prose of the proposed lines that nothing explains: not a value of the sheet
 * (in any unit), not a number written elsewhere (the assignment, the theory, a literal of a formula).
 */
export function loneNumbers(prose: readonly string[], values: readonly number[], written: readonly string[]): LoneNumber[] {
  // A number written elsewhere is the same number; only a value of the sheet may be shown in another unit.
  const given = new Set(written.flatMap((w) => numbersIn(w).map((n) => n.value)));
  return prose.flatMap((line) =>
    numbersIn(line)
      .filter((n) => !(Number.isInteger(n.value) && n.value <= SMALL))
      .filter((n) => !given.has(n.value) && !values.some((v) => explains(n.value, v)))
      .map((n) => ({ number: n.text, line })),
  );
}

/** The text a line shows: its strings ("…" lines, check labels), not its formulas. */
export function proseOf(line: string): string[] {
  return [...line.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]!).filter((s) => s.trim() !== '');
}

/**
 * The lines of a change that are Python, not the language of the sheet: a loop or a block (while …:, for …:,
 * def …:), an import, x += …, x ** 2, result(…, rel=…). A "# …" line is a heading of the sheet, not counted.
 */
export function pythonLines(lines: readonly string[]): string[] {
  return lines.filter((line) => /^\s*(while|for|if|elif|else|def|with|try|except)\b.*:\s*(#.*)?$/.test(line) || /^\s*(import|from)\s+\w+/.test(line) || /^\s*\w+\s*[-+*/]=/.test(line) || /\*\*/.test(line) || /\bresult\(.*\brel\s*=/.test(line) || /^\s*\w+(\s*,\s*\w+)+\s*=[^=]/.test(line));
}

/** Whether the proposed sheet needs the model again. */
export function sheetNeedsAnswer(check: SheetCheck | undefined): boolean {
  return !!check && (check.problems.length > 0 || check.numbers.length > 0 || (check.python?.length ?? 0) > 0 || (check.failed?.length ?? 0) > 0);
}

/** Text shown as it is in Markdown: names keep their underscores (smoke_d, t_v), not turned to italics. */
const plain = (text: string) => text.replace(/[_*]/g, (c) => `\\${c}`);

/** The report of the proposed sheet, as a turn of the program the model answers. */
export function sheetReport(check: SheetCheck, words: SheetWords): string {
  const parts = [`**${words.title}**`];
  if (check.python && check.python.length > 0) parts.push(`${words.python}\n\n${check.python.slice(0, 5).map((l) => `- \`${l.trim().replace(/`/g, "'")}\``).join('\n')}`);
  if (check.problems.length > 0) parts.push(`${words.problems}\n\n${check.problems.map((p) => `- \`${p.line.trim().replace(/`/g, "'")}\` – ${plain(p.message)}`).join('\n')}`);
  if (check.failed && check.failed.length > 0) parts.push(`${words.failed}\n\n${check.failed.map((f) => `- ${plain(f.label)}: \`${f.line.trim().replace(/`/g, "'")}\``).join('\n')}`);
  const hints = [...new Set(check.problems.flatMap((p) => (p.code && words.hints[p.code] ? [words.hints[p.code]!] : [])))];
  if (hints.length > 0) parts.push(hints.join('\n\n'));
  if (check.numbers.length > 0) parts.push(`${words.numbers}\n\n${check.numbers.map((n) => `- ${n.number}: „${plain(n.line.trim())}“`).join('\n')}`);
  parts.push(words.ask);
  return parts.join('\n\n');
}
