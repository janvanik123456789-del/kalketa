/**
 * Blocks of an answer the user acts on (docs/01-filozofie.md, ch. 9), written like the change blocks:
 *
 *   ```choice detail How detailed should the calculation be?
 *   brief: Briefly – formula, numbers, result
 *   paper: As on paper – relations of the theory, derivation step by step
 *   ```
 *   A question with answers as buttons: a click sends the answer; a known key (detail) also
 *   keeps the choice in the calculation, so it is not asked again.
 *
 *   ```note ai Check in Python
 *   …Markdown…
 *   ```
 *   Text proposed for a layer (ai: the AI notes, sources: the sources); the user puts it in with a click.
 */

/** Levels of detail of a calculation the model writes (Calculation properties, or asked by a choice). */
export const DETAIL_LEVELS = ['brief', 'paper', 'teaching'] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export interface ChoiceBlock {
  /** What it decides, when the program knows it (detail); else a plain question. */
  readonly key?: string;
  readonly question: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface NoteBlock {
  readonly target: 'ai' | 'sources';
  readonly title: string;
  readonly text: string;
}

const CHOICE = /^```choice(?:[ \t]+([^\n]*?))?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const NOTE = /^```note[ \t]+(ai|sources)(?:[ \t]+([^\n]*?))?[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
/** A key is one plain word in small letters before the question. */
const KEY = /^([a-z][a-z0-9_-]*)(?:[ \t]+|$)/;

/** The questions of an answer, in order; a block without at least two answers is left out. */
export function parseChoices(answer: string): ChoiceBlock[] {
  return [...answer.matchAll(CHOICE)].flatMap((m): ChoiceBlock[] => {
    const head = (m[1] ?? '').trim();
    const key = KEY.exec(head)?.[1];
    const question = key ? head.slice(key.length).trim() : head;
    const options = m[2]!
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*]\s+/, ''))
      .filter((line) => line !== '')
      .map((line) => {
        const parts = /^([^:]{1,40}):\s*(.+)$/.exec(line);
        return parts ? { value: parts[1]!.trim(), label: parts[2]!.trim() } : { value: line, label: line };
      });
    return options.length >= 2 ? [{ ...(key ? { key } : {}), question, options }] : [];
  });
}

/** The notes an answer proposes for the layers, in order; empty ones left out. */
export function parseNotes(answer: string): NoteBlock[] {
  return [...answer.matchAll(NOTE)].flatMap((m): NoteBlock[] => {
    const text = m[3]!.replace(/\s+$/, '');
    return text.trim() ? [{ target: m[1] as NoteBlock['target'], title: (m[2] ?? '').trim(), text }] : [];
  });
}

/** The answer without its questions and notes, which are shown as buttons and cards below it. */
export function withoutAnswerBlocks(answer: string, choicePlaceholder: (n: number) => string, notePlaceholder: (n: number) => string): string {
  let c = 0;
  let n = 0;
  return answer.replace(CHOICE, () => choicePlaceholder(++c)).replace(NOTE, () => notePlaceholder(++n));
}

/** The text a note puts into its layer: its title as a heading, then the text. */
export function noteText(note: NoteBlock): string {
  return note.title ? `## ${note.title}\n\n${note.text.trim()}\n` : `${note.text.trim()}\n`;
}
