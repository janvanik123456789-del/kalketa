/**
 * An entry of the formula library (docs/navrhy/KNIHOVNA-VZORCU.md): one equation with the quantities in it,
 * where it comes from and how it was checked. Content is data, one JSON file per entry, so the core knows no
 * field and the user's own formulas work as the built-in ones do.
 */

export type Language = 'cs' | 'en';

/** A text in each language of the program; English stands in for a language the entry lacks. */
export type Text = Readonly<Partial<Record<Language, string>>> & { readonly en: string };

export interface QuantityInfo {
  /** What the quantity is ("ohybový moment"), written as a comment beside an input. */
  readonly name: Text;
  /** The unit of the result when the formula is rearranged for it: MPa, kN·m. */
  readonly unit: string;
  /** An example value with its unit (50 kN*m): an input inserted with it is marked {example}. */
  readonly example: string;
}

/**
 * Verified: a value agrees with an independent calculation or with the source. Computed: the formula
 * calculates, nobody checked it independently. Own: written by the user, no guarantee of the program.
 */
export type EntryStatus = 'verified' | 'computed' | 'own';

export interface EntryCheck {
  /** Values of the other quantities. */
  readonly given: Readonly<Record<string, string>>;
  /** The quantity sought and what it must come out at (166.67 MPa). */
  readonly expect: Readonly<Record<string, string>>;
}

export interface Entry {
  readonly id: string;
  /** The field as the samples number it: "03" mechanical engineering (samples.field.03 of the catalog). */
  readonly field: string;
  /** Its part: "Pružnost a pevnost". */
  readonly group: Text;
  readonly title: Text;
  /** Where the formula comes from, printed as its source; the sample of Kalketa that uses it (R12). */
  readonly source: { readonly text: Text; readonly sample?: string };
  readonly status: EntryStatus;
  /** One equation in the calculation language: σ == M/W. */
  readonly formula: string;
  /** The quantities of the formula in the order the dialog offers them. */
  readonly quantities: Readonly<Record<string, QuantityInfo>>;
  readonly checks: readonly EntryCheck[];
  /** More words to find it by ("ohyb", "bending"). */
  readonly keywords?: Readonly<Partial<Record<Language, readonly string[]>>>;
}

/** What is wrong with an entry file; the code names the field, the text stays with the program. */
export interface EntryProblem {
  readonly origin: string;
  readonly field: string;
}

export function text(t: Text, language: Language): string {
  return t[language] ?? t.en;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is Text => isObject(v) && typeof v.en === 'string' && Object.values(v).every((s) => typeof s === 'string');
const isStrings = (v: unknown): v is Record<string, string> => isObject(v) && Object.values(v).every((s) => typeof s === 'string');

/** An entry read from its JSON, or the first field that is missing or wrong. */
export function readEntry(raw: unknown, origin: string): Entry | EntryProblem {
  const problem = (field: string): EntryProblem => ({ origin, field });
  if (!isObject(raw)) return problem('entry');
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]+$/.test(raw.id)) return problem('id');
  if (typeof raw.field !== 'string' || !/^\d\d$/.test(raw.field)) return problem('field');
  if (!isText(raw.group)) return problem('group');
  if (!isText(raw.title)) return problem('title');
  if (!isObject(raw.source) || !isText(raw.source.text) || (raw.source.sample !== undefined && typeof raw.source.sample !== 'string')) return problem('source');
  if (raw.status !== 'verified' && raw.status !== 'computed' && raw.status !== 'own') return problem('status');
  if (typeof raw.formula !== 'string' || raw.formula.split('==').length !== 2) return problem('formula');
  if (!isObject(raw.quantities) || Object.keys(raw.quantities).length < 2) return problem('quantities');
  for (const [name, q] of Object.entries(raw.quantities)) {
    if (!isObject(q) || !isText(q.name) || typeof q.unit !== 'string' || typeof q.example !== 'string') return problem(`quantities.${name}`);
  }
  const checks = raw.checks ?? [];
  if (!Array.isArray(checks) || !checks.every((c) => isObject(c) && isStrings(c.given) && isStrings(c.expect) && Object.keys(c.expect).length === 1)) return problem('checks');
  if (raw.status === 'verified' && checks.length === 0) return problem('checks');
  if (raw.keywords !== undefined && !(isObject(raw.keywords) && Object.values(raw.keywords).every((k) => Array.isArray(k) && k.every((w) => typeof w === 'string')))) return problem('keywords');
  return raw as unknown as Entry;
}

export function isEntry(read: Entry | EntryProblem): read is Entry {
  return 'formula' in read;
}

/** The two sides of the equation as written: ["σ", "M/W"]. */
export function sides(entry: Entry): [string, string] {
  const [left, right] = entry.formula.split('==');
  return [left!.trim(), right!.trim()];
}

/** Entries of files given as path → JSON text, in the order of field, group and title; files that are no entry apart. */
export function readEntries(files: Readonly<Record<string, string>>): { entries: Entry[]; problems: EntryProblem[] } {
  const entries: Entry[] = [];
  const problems: EntryProblem[] = [];
  for (const [path, json] of Object.entries(files)) {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      problems.push({ origin: path, field: 'json' });
      continue;
    }
    const read = readEntry(raw, path);
    if (isEntry(read)) entries.push(read);
    else problems.push(read);
  }
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) problems.push({ origin: e.id, field: 'id' });
    ids.add(e.id);
  }
  const by = (t: Text) => text(t, 'cs');
  entries.sort((a, b) => a.field.localeCompare(b.field) || by(a.group).localeCompare(by(b.group), 'cs') || by(a.title).localeCompare(by(b.title), 'cs'));
  return { entries, problems };
}
