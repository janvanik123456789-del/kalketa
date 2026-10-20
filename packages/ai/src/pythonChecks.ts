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
  /** Python's value is a round number (10 000, 9 000): a loop that ended by its cap, not by its event. */
  readonly round?: boolean;
}

/** A round number of at most two significant digits and at least 100: what a loop stopped by its cap gives. */
export function isRoundResult(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) >= 100 && Number(value.toPrecision(2)) === value;
}

/** A run of one check. */
export interface CheckReport {
  readonly ok: boolean;
  /** What went wrong (the last line of a traceback, a timeout). */
  readonly error?: string;
  /** What the script printed besides its results (kept short for the model). */
  readonly output: string;
  readonly rows: readonly CheckRow[];
  /** The user did not let it run (asked before it, declined). */
  readonly declined?: boolean;
  /** Not run: the sheet has none of the names it reports yet (the calculation is to be written first). */
  readonly postponed?: readonly string[];
}

/** The names a check reports, read from its text: result("v_A", …). */
export function reportedNames(code: string): string[] {
  return [...new Set([...code.matchAll(/\bresult\(\s*(["'])([^"'\n]+)\1/g)].map((m) => m[2]!))];
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
  /** Said to the model when a script ran out of time: how to make it faster. */
  readonly timeout: string;
  /** Said to the model when the sheet has none of the names yet: the calculation is not in it, not wrong. */
  readonly missing: string;
  /** Said to the model when a result that disagrees is a round number: the loop likely ended by its cap. */
  readonly capped: string;
  /** Said to the model when a check was not run: the sheet has none of its names; write the calculation first. */
  readonly postponed: string;
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
    if (r.postponed) {
      parts.push(`${head}${words.postponed} (${r.postponed.join(', ')})`);
      return;
    }
    if (!r.ok) parts.push(`${head}${words.failed}: \`${(r.error ?? '').replace(/`/g, "'")}\``);
    if (!r.ok && /timeout/i.test(r.error ?? '')) parts.push(words.timeout);
    if (r.rows.some((row) => row.round && row.state !== 'agree')) parts.push(words.capped);
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
  // Results the sheet has no value for are not a disagreement: the calculation is not in the sheet yet.
  const rows = reports.flatMap((r) => (r.declined ? [] : r.rows));
  const onlyMissing = reports.every((r) => r.declined || r.ok) && rows.length > 0 && rows.every((row) => row.state === 'agree' || row.state === 'missing') && rows.some((row) => row.state === 'missing');
  if (onlyMissing) parts.push(words.missing);
  else if (checksNeedAnswer(reports)) parts.push(words.ask);
  return parts.join('\n\n');
}

/** What the briefing tells the model about checks in Python, when the program can run them. */
export function pythonRule(numpy: boolean): string {
  const fence = '`'.repeat(3);
  return `- You can check a calculation independently in Python. The check is worth something only when it reaches the result another way than the sheet: a step-by-step simulation of the differential equation instead of its integral, energy instead of forces, a library routine instead of the formula, a limiting case. Never write the sheet's formula again in Python: two copies of one formula always agree and prove nothing. Report each result under the name it has in the sheet:
  ${fence}python
  from math import sqrt
  # free fall from h: step by step, not v = sqrt(2 g h)
  g, h, dt = 9.81, 9.0, 1e-3
  v = y = 0.0
  while y < h:
      v += g * dt
      y += v * dt
  result("v_A", v, "m/s", rel=1e-3)
  ${fence}
  result(name, value, unit="", rel=1e-6): the unit as Kalketa writes it ("m/s", "kN", "m^2", "°C", "" for a plain number), rel the relative difference still taken as agreement (1e-3 or so for a simulation, by its step).
  The program runs every python block of your answer at once in a sandboxed Python 3.14 (the standard library${numpy ? ' and NumPy' : ''}; no files, no network, no input; at most 30 s, so keep a simulation under about 200 000 steps: choose the step from the time it covers (dt = t_end/100000), prefer Runge–Kutta 4 to Euler) and gives you back a table of each result beside the value its core calculated.
  A simulation: step the state by its rate as the rate is (h += dt·f(h), f = dh/dt carries its own sign; never h -= dt·f), stop at the event (the tank empty, the body on the ground) and land on it exactly (the last step shortened); check that the loop ended by the event, not by a cap of steps: if it hit the cap, report nothing and say so. Do not integrate a formula that is infinite at a bound (1/sqrt(h) from 0) by Simpson or the trapezoid rule; substitute or simulate instead. Python writes powers as ** (^ is another operator). Python goes only into python blocks, never into a change or sheet block: the sheet does not run it.
  Order: write the calculation into the sheet first (its change block), then check it: in the same answer after the change block (the check is compared with the sheet as the change makes it), or once the user accepted it. A check of names the sheet does not have is not run.
  When a result disagrees, find out which side is wrong before you propose a change, and say so. Check when the user asks for a check or the level of detail asks for one, and when you propose a calculation whose result can be reached another way; not for trivial lines.`;
}
