/**
 * The model checks a calculation in Python (docs/01-filozofie.md, ch. 9): it writes the problem
 * another way in a ```python block, reporting results by the names of the sheet with
 * result(name, value, unit). The program runs every such block of an answer at once, in its
 * built-in Python (no files, no network), sets the results beside the values its core calculated,
 * and gives the table back as the next turn of the conversation: the model sees whether the two
 * engines agree, and corrects itself when they do not. Nothing here runs anything; the program does.
 */

const BLOCK = /^```python[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

/** The checks in an answer: the code of its ```python blocks, in order; empty ones left out. */
export function parsePythonChecks(answer: string): string[] {
  return [...answer.matchAll(BLOCK)].map((m) => m[1]!.replace(/\s+$/, '')).filter((code) => code.trim() !== '');
}

/** One result set beside the sheet, as the conversation shows it. */
export interface CheckRow {
  readonly name: string;
  /** The sheet's value with its unit, written out; undefined when the sheet has no such name. */
  readonly kalketa?: string;
  readonly python: string;
  /** Relative difference. */
  readonly difference?: number;
  readonly state: 'agree' | 'differ' | 'missing' | 'units' | 'unit';
}

/** A run of one check. */
export interface CheckReport {
  readonly ok: boolean;
  /** What went wrong (the last line of a traceback, a timeout). */
  readonly error?: string;
  /** What the script printed besides its results (kept short for the model). */
  readonly output: string;
  readonly rows: readonly CheckRow[];
  /** The user did not let it run (Python of the computer, declined). */
  readonly declined?: boolean;
}

/** Whether a check needs the model again: it failed, a result disagrees, or it reported nothing. */
export function checksNeedAnswer(reports: readonly CheckReport[]): boolean {
  return reports.some((r) => !r.declined && (!r.ok || r.rows.length === 0 || r.rows.some((row) => row.state !== 'agree')));
}

/** The words of the report, in the user's language (the model reads them too). */
export interface CheckWords {
  readonly title: string;
  readonly quantity: string;
  readonly difference: string;
  readonly states: Readonly<Record<CheckRow['state'], string>>;
  readonly failed: string;
  readonly declined: string;
  readonly none: string;
  readonly output: string;
  /** Said to the model when something disagrees or failed. */
  readonly ask: string;
}

/** Longest output of a script given back (the end of it, where the error is). */
const MAX_OUTPUT = 1500;

/** The report of the checks of an answer, in Markdown: a table per check, what failed and why. */
export function pythonReport(reports: readonly CheckReport[], words: CheckWords, format: (n: number) => string): string {
  const parts = [`**${words.title}**`];
  reports.forEach((r, i) => {
    const head = reports.length > 1 ? `${i + 1}. ` : '';
    if (r.declined) {
      parts.push(`${head}${words.declined}`);
      return;
    }
    if (!r.ok) parts.push(`${head}${words.failed}: \`${(r.error ?? '').replace(/`/g, "'")}\``);
    if (r.rows.length > 0) {
      parts.push(
        [
          `${head ? `${head}\n\n` : ''}| ${words.quantity} | Kalketa | Python | ${words.difference} | |`,
          '|---|---:|---:|---:|---|',
          ...r.rows.map((row) => `| ${row.name} | ${row.kalketa ?? '–'} | ${row.python} | ${row.difference !== undefined ? `${format(row.difference * 100)} %` : ''} | ${row.state === 'agree' ? '✓' : `✗ ${words.states[row.state]}`} |`),
        ].join('\n'),
      );
    } else if (r.ok) parts.push(`${head}${words.none}`);
    const output = r.output.trim();
    if (output) parts.push(`${words.output}:\n\n\`\`\`text\n${output.length > MAX_OUTPUT ? `…${output.slice(-MAX_OUTPUT)}` : output}\n\`\`\``);
  });
  if (checksNeedAnswer(reports)) parts.push(words.ask);
  return parts.join('\n\n');
}

/** What the briefing tells the model about checks in Python, when the program can run them. */
export function pythonRule(numpy: boolean): string {
  const fence = '`'.repeat(3);
  return `- You can check a calculation independently in Python. Solve the same problem another way (a step-by-step simulation instead of an integral, a library routine instead of the sheet's formula, energy instead of forces) and report each result under the name it has in the sheet:
  ${fence}python
  from math import sqrt
  result("v_A", sqrt(2 * 9.81 * 9.0), "m/s")
  ${fence}
  result(name, value, unit="", rel=1e-6): the unit as Kalketa writes it ("m/s", "kN", "m^2", "°C", "" for a plain number), rel the relative difference still taken as agreement (larger for a simulation). The program runs every python block of your answer at once in a sandboxed Python 3.14 (the standard library${numpy ? ' and NumPy' : ''}; no files, no network, at most 30 s; no input, only print) and gives you back a table of each result beside the value its core calculated. When a result disagrees, find out which side is wrong before you propose a change, and say so. Check when the user asks for a check, and when you propose a calculation whose result can be reached another way; not for trivial lines.`;
}
