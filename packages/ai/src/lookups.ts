/**
 * The model may look things up in what Kalketa carries: its formula library and its worked samples. It gets a short
 * catalog (ids and titles, no contents) with the steady part of its briefing, and asks for what it needs by a
 * ```lookup block; the program gives it their text as the next message, as it gives back the checks in Python.
 * Nothing of it is read in advance: a model that needs none of it pays only for the catalog.
 */

const BLOCK = /^```lookup[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

/** One thing asked for: a formula of the library or a sample, by its id from the catalog. */
export interface LookupRequest {
  readonly kind: 'formula' | 'sample';
  readonly id: string;
}

/** At most this many things a time: the answer to them goes into the conversation and fills its window. */
export const MAX_LOOKUPS = 3;

/** What an answer asks for, in order, each once; lines that ask for nothing known are left out. */
export function parseLookups(answer: string): LookupRequest[] {
  const asked: LookupRequest[] = [];
  for (const block of answer.matchAll(BLOCK))
    for (const line of block[1]!.split(/\r?\n/)) {
      const m = /^\s*(formula|sample)\s+([A-Za-z0-9_.-]+)\s*$/.exec(line);
      if (m && !asked.some((a) => a.kind === m[1] && a.id === m[2])) asked.push({ kind: m[1] as LookupRequest['kind'], id: m[2]! });
    }
  return asked;
}

/** The answer without its lookup blocks: what the user reads of it. */
export function withoutLookups(answer: string): string {
  return answer.replace(BLOCK, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** One line of the catalog. */
export interface CatalogItem {
  readonly kind: 'formula' | 'sample';
  readonly id: string;
  readonly title: string;
  /** The field or part it belongs to ("Pružnost a pevnost"). */
  readonly group?: string;
  /** A formula: the equation itself (σ == M/W), short enough to show what it is. */
  readonly formula?: string;
}

/** The catalog as the model reads it, with the rule of asking for its items. */
export function catalogText(items: readonly CatalogItem[], via: 'block' | 'tools' = 'block'): string {
  if (items.length === 0) return '';
  const fence = '`'.repeat(3);
  const list = (kind: CatalogItem['kind']) => {
    const groups = new Map<string, CatalogItem[]>();
    for (const item of items.filter((i) => i.kind === kind)) groups.set(item.group ?? '', [...(groups.get(item.group ?? '') ?? []), item]);
    return [...groups].map(([group, its]) => `${group ? `${group}:\n` : ''}${its.map((i) => `- ${i.id}: ${i.title}${i.formula ? ` (${i.formula})` : ''}`).join('\n')}`).join('\n');
  };
  const formulas = list('formula');
  const samples = list('sample');
  const head = `What Kalketa carries, to look up when it helps (only the list is here; you get the contents on request):
${formulas ? `Formula library (each formula with its quantities, units, an example and its source):\n${formulas}\n` : ''}${samples ? `Worked samples (whole sheets in the calculation language, checked):\n${samples}\n` : ''}`;
  if (via === 'tools')
    return `${head}
Read one with formula_get or sample_get. A sample is worth reading when its title names the same subject as the task (a transformer for a transformer); it is inspiration, never data of the user's task. A formula of the library you use is cited by its source as given there.`;
  return `${head}
To read some, ask in a block of its own, one per line, at most ${MAX_LOOKUPS}:
${fence}lookup
formula <id>
sample <id>
${fence}
The program sends their text in the next message; write nothing else in that answer but a sentence of what you look for and why. Ask only when it helps: the user asks for a formula or a worked example, or you are unsure how Kalketa writes such a calculation and the list has a sample of the same kind (its title names the same subject: a transformer for a transformer, a beam for a beam). When no title fits the task, ask for nothing: the theory of the sheet is the source then. Do not ask for what you have read in this conversation already. A formula of the library you use is cited by its source as given there; a sample is inspiration, never data of the user's task.`;
}

/** Longest text of one sample sent: the start of a long sheet shows how it is written. */
export const MAX_SAMPLE_CHARS = 12_000;
