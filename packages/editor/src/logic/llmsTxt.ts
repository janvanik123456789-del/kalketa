/**
 * llms.txt (llmstxt.org): the language of Kalketa for a model in any chat window (ChatGPT, Claude.ai, Gemini) that has
 * no access to the program. Made from the same parts as the briefing of the built-in AI, so the two never differ:
 * the guide of the language with its built-in functions and tested fragments, the rules of writing a calculation, and
 * the messages of the program the user will paste back. The file at the root of the repository is checked against it
 * by a test (docs/navrhy/AI-Z-CHATU.md).
 */

import { defaultRegistry, DIAGNOSTIC_SEVERITY, type DiagnosticCode } from '@kalketa/core';
import { CATALOGS } from '@kalketa/i18n';
import { DETAIL_RULES, SHEET_RULES } from '@kalketa/ai';
import { languageGuide, SHEET_FRAGMENTS } from './aiContext.js';

const FENCE = '`'.repeat(3);

/** What a model writing in a chat gets wrong most, with the message the program then gives. */
const COMMON_MESSAGES: readonly DiagnosticCode[] = [
  'E-SYNTAX',
  'E-MISSING-OPERATOR',
  'E-ASSIGN-WITH-EQUALS',
  'E-UNEXPECTED-CHAR',
  'E-UNDEFINED',
  'E-DEFINED-LATER',
  'E-REDEFINED',
  'E-FUNC-UNKNOWN',
  'E-FUNC-ARITY',
  'E-FUNCTION-UNCALLED',
  'E-CALCULUS-FORM',
  'E-UNKNOWN-UNIT',
  'E-UNIT-MISMATCH',
  'W-BARE-UNIT',
  'W-NAME-AS-UNIT',
  'E-ABS-TEMP',
  'E-TABLE-KEY',
  'E-TABLE-COLUMN',
  'E-SOLVE-NO-ROOT',
  'E-SOLVE-NO-CONVERGENCE',
  'E-ODE-CONDITIONS',
  'E-DERIVE-UNITS',
];

/** The text of llms.txt. */
export function llmsTxt(): string {
  const en = CATALOGS['en']!;
  const messages = COMMON_MESSAGES.filter((code) => code in DIAGNOSTIC_SEVERITY).map((code) => `- ${code}: ${en.diagnostics[code]}`);
  const units = defaultRegistry.unitSymbols();
  const prefixed = units.filter((u) => u.prefixable).map((u) => u.symbol);
  const plain = units.filter((u) => !u.prefixable).map((u) => u.symbol);
  return [
    '# Kalketa',
    '',
    '> Kalketa is an engineering calculation sheet (like Mathcad): lines of definitions with units, checks, tables, charts and differential equations, printed as a report. This file teaches a model in a chat window to write a calculation the user pastes into Kalketa.',
    '',
    '## Checklist before every answer',
    '',
    '1. The whole calculation in ONE code block, starting with one title line "# …" (no second title).',
    '2. Multiply with · and write π and Greek letters (σ, ρ, τ): never *, pi or spelled-out names like sigma.',
    '3. Each value defined once with := and its unit; a definition already prints its value, so no extra line "name =" after it.',
    '4. Text lines are whole lines in double quotes and hold no formula; a law of the theory is a line "relation … {eq}".',
    '5. Every assumption (which diameter, which material, what is neglected) is a text line of its own.',
    '6. Data of more rows (materials, profiles) as a separate Markdown table block for the data layer, read by pick(Table, "key").column; not typed into the calculation.',
    '7. Where the task has a limit, end with check "…": value ≤ limit; finish with one text line saying what was found.',
    '',
    '## How to help in a chat',
    '',
    `- Return the calculation as plain text in ONE code block (${FENCE}), every line of it, nothing else inside the block. Explain outside the block, briefly, in the user's language.`,
    '- The user pastes the block into Kalketa (Ctrl+V) and the program calculates it at once. Its messages come back to you as "line N: CODE message"; correct those lines and return the whole calculation again in one block.',
    '- A table of data (profiles, materials, measurements) may come as its own block in Markdown (| Profil | A [cm²] |, a line |---| under the head); the user pastes it into a data layer and the calculation reads it by its name. A check in Python may come as a block of python with result("name", value, "unit") for each value it checks.',
    '- Write in the notation of the file: a decimal point (2.5) and a comma between arguments (max(a, b)). Kalketa shows Czech users a decimal comma and ";" itself.',
    '- Never invent data: values of materials, profiles and loads come from a table or a source the user can check; say what is missing.',
    '',
    '## The language',
    '',
    // The guide without its fragments: here they go as blocks of code, their headings (## Zadání) no headings of this file.
    languageGuide().split('\nSample fragments of a sheet')[0]!,
    '',
    '## Samples (write in this form)',
    '',
    ...SHEET_FRAGMENTS.flatMap((f) => [`${f.topic}:`, FENCE, f.source, FENCE, '']),
    '',
    '## Writing a calculation',
    '',
    SHEET_RULES,
    '',
    'Levels of detail (the user says which; "brief" when not said):',
    ...Object.values(DETAIL_RULES).map((rule) => `- ${rule}`),
    '',
    '## Messages of the program',
    '',
    'The ones a model meets most; {…} stand for names and values. Every message has a code, so search this file or the guide above for what it needs.',
    ...messages,
    '',
    '## Units',
    '',
    'Written after a number (6 m, 10 kN/m, 235 MPa, 20 °C), combined with · and / and powers (kN·m, W/(m²·K), m^3 or m³). A difference of temperatures is Δ°C or K.',
    `- With prefixes (k, M, G, m, μ, n; u for μ): ${prefixed.join(', ')}.`,
    `- Without prefixes: ${plain.join(', ')}.`,
    '',
  ].join('\n');
}
