/**
 * How the model writes a calculation into the sheet (docs/01-filozofie.md, ch. 9): rules for every
 * sheet, and what each level of detail adds. The level is the user's: set in the Calculation
 * properties, or asked by a choice block when it is not set.
 */

import { DETAIL_LEVELS, type DetailLevel } from './answerBlocks.js';

const FENCE = '`'.repeat(3);

/** What each level asks of the calculation, as the briefing says it. */
export const DETAIL_RULES: Readonly<Record<DetailLevel, string>> = {
  brief: `Level "brief": each result is one definition, name := formula | unit; the print shows the formula, the numbers put in and the result. Text only where a choice or an assumption needs it.`,
  paper: `Level "paper" (as a hand calculation in a textbook): for each result
  1. a text line saying what is done and from which section of the theory, with its citation;
  2. the relations of the theory it comes from, each on a line of its own: relation … {eq} (the general law, then the conditions of the task, one per line: relation p_1 == p_a {eq});
  3. the derivation down to the formula: derive a == b (a step per line; the program checks each step follows from the relations above);
  4. the definition with the formula: name := formula | unit (the print puts the numbers in).
  A formula taken from the theory is still derived from its relations, not copied. Number the equations ({eq}) and refer to them in text as (#name) where it helps.`,
  teaching: `Level "teaching": as "paper", and in addition a text line before each step explaining in plain words why it holds (the physics, not the algebra), a sketch or picture of the sheet referred to where it helps, and every result checked independently in Python when the program can run checks.`,
};

/** The rules for writing a calculation into the sheet; with the level the user chose, or the request to ask for one. */
export function writingRules(detail: DetailLevel | undefined): string {
  const level = detail
    ? `The user chose the level of detail "${detail}" for this sheet; write in it unless the user asks otherwise in the conversation.\n${DETAIL_RULES[detail]}`
    : `The user has not chosen how detailed the calculation should be. Before you write a calculation (not for a question or a small change), ask with a choice block and wait for the answer:
  ${FENCE}choice detail How detailed should the calculation in the sheet be?
  brief: Briefly – formula, numbers and result
  paper: As on paper – relations of the theory, derivation step by step
  teaching: For teaching – also each step explained and checked in Python
  ${FENCE}
  Write the question and the answers in the user's language; keep the key "detail" and the values ${DETAIL_LEVELS.join(', ')}. The program shows the answers as buttons and keeps the choice in the calculation.
${DETAIL_LEVELS.map((l) => DETAIL_RULES[l]).join('\n')}`;
  return `How to write a calculation into the sheet:
- Keep the assignment as it is (its text, given values, picture) and write the solution below it, under headings, one part of the task per heading, as ONE block that inserts it after the last line of the assignment: ${FENCE}change after <that line number>. A ${FENCE}sheet block opens a new file; use it only when the user asks for a new calculation, never for the solution of this one.
- Given values one per line with their unit and a comment: L := 6 m            ' span. A value given in another unit is not copied into a new name; the unit it is shown in is set with | (A := π·d²/4 | mm²).
- Names as in the theory and the task (σ_k, h_1, v_A), each defined once, above its use. A definition prints its value; no extra line "name =" after it. The same quantity computed a second way (an integral and its closed form) gets a name of its own and the two are compared: t_v2 := … then check "Uzavřený tvar": t_v2 == t_v.
- A number in text (a ratio, a comparison, "~4000× wider") is computed in the sheet first, on a line of its own with a name; text never claims a number the sheet does not compute. The program checks the proposed sheet and returns its errors and such numbers to you.
- Choose the unit a result is shown in so it reads well (| m², | min, | kN·m), not the unit of the formula.
- Units convert themselves: m² and cm², kN and N, min and s may stand in one formula as they are; never convert values by hand, never copy a value into another unit to make a formula work.
- A zero needs no unit: y_2 == 0, p_a + ρ·g·0 (a zero written bare is of any unit).
- A name that is not defined and is also a unit is read as the unit: t is tonnes, s seconds, m metres, g grams, h hours. A quantity that changes with time or position is a function of it, its variable a parameter: h(t) := (sqrt(h_1) - k·t)^2, v_1(t) := sqrt(2·g·h(t)); never t used outside a function, an integral or a chart.
- A chart of a function: plot(h(t), t: 0 s .. t_v). Quantities of different units go into separate charts, one plot line each; never scale a curve (h·10) to share an axis.
- A text line is text only: no values joined to it ("…" ratio "…" or "…"·x is wrong); a value is printed by its own line.
- The starting equation of the theory (Bernoulli for two points, continuity) is a relation … {eq}; derive only writes the steps that follow from the relations above it.
- An integral is written with its integrand, its variable and its bounds: integral(1/sqrt(h), h: 0 .. h_1); the variable is the name (h), not its differential (dh).
- State every assumption as a text line with the section of the theory it comes from (the one that says it), e.g. "Vlastní tíhu nosníku zanedbáváme." [T2].
- Where the task has a limit or a requirement, end with a check: check "…": value ≤ limit.
- Finish with a short text line saying what was found; the values are printed by their own lines above, do not copy numbers into text.
${level}
- A question with answers the user picks from (not only the level of detail) may be asked the same way, without a key: ${FENCE}choice Which profile? then one answer per line, value: description.
- You cannot write into the layers yourself. To keep text in the sources or in the AI notes (a check, a summary, a note for later), propose it as a block the user puts in with one click:
  ${FENCE}note ai Check in Python
  …text in Markdown, code blocks allowed…
  ${FENCE}
  "note sources Title" proposes it for the sources (theory, checks to run again), "note ai Title" for the AI notes. Never say you saved something; say you propose it.`;
}
