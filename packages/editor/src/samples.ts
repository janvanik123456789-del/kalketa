/// <reference types="vite/client" />
/**
 * The sample calculations shipped with the program (File > Sample calculations):
 * the reference cases with their tables, each opened as a new document.
 */

import { newDocument, type SheetDocument, type StoredTable } from '@kalketa/sheet';

// The sample calculations shipped with the program: the reference cases with their tables.
const SAMPLE_SHEETS = import.meta.glob<string>('../../../reference/*/*.cc', { query: '?raw', import: 'default', eager: true });
const SAMPLE_TABLES = import.meta.glob<string>('../../../reference/*/tables/*/{schema.json,data.csv}', { query: '?raw', import: 'default', eager: true });
/** Variants of a case kept for the tests only. */
const TEST_VARIANTS = new Set(['bez-tabulek']);
export const DEFAULT_SAMPLE = 'R1-nosnik';

export interface Sample {
  /** The folder of the case ("R1-nosnik"). */
  readonly id: string;
  /** Its first heading ("Posouzení nosníku N1"). */
  readonly title: string;
  /** The language of its printout: a sheet named *.en.cc is in English, the others in Czech. */
  readonly language: string;
}

/** The sample calculations, in the order of their folders. */
export function samples(): Sample[] {
  return Object.entries(SAMPLE_SHEETS)
    .flatMap(([path, source]) => {
      const [, id, file] = /\/reference\/([^/]+)\/([^/]+)\.cc$/.exec(path) ?? [];
      if (!id || !file || TEST_VARIANTS.has(file)) return [];
      return [{ id, title: /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? id, language: languageOf(file) }];
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/**
 * A sample calculation as a new, unsaved document. Its title says it is a
 * sample, so saving it never offers the name of the user's own calculation.
 */
export function exampleDocument(id = DEFAULT_SAMPLE, prefix = 'Vzor'): SheetDocument {
  const entry = Object.entries(SAMPLE_SHEETS).find(([path]) => path.includes(`/reference/${id}/`) && !TEST_VARIANTS.has(/([^/]+)\.cc$/.exec(path)?.[1] ?? ''));
  const source = entry?.[1] ?? '';
  const title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? id;
  const base = newDocument(`${prefix} – ${title}`, source);
  const tables = new Map<string, StoredTable>();
  for (const [path, text] of Object.entries(SAMPLE_TABLES)) {
    const [, folder, name, file] = /\/reference\/([^/]+)\/tables\/([^/]+)\/([^/]+)$/.exec(path) ?? [];
    if (folder !== id || !name) continue;
    const table = tables.get(name) ?? { schemaJson: '', dataCsv: '' };
    tables.set(name, file === 'schema.json' ? { ...table, schemaJson: text } : { ...table, dataCsv: text });
  }
  const file = /([^/]+)\.cc$/.exec(entry?.[0] ?? '')?.[1] ?? '';
  return { ...base, manifest: { ...base.manifest, language: languageOf(file) }, tables };
}

/** quadratic-equation.en → en; a sheet without a language in its name is Czech. */
function languageOf(file: string): string {
  return /\.([a-z]{2})$/.exec(file)?.[1] ?? 'cs';
}

/**
 * The title of a sample saved as the user's own file: the file name without
 * the sample prefix; undefined for a document that is no sample.
 */
export function savedSampleTitle(title: string, path: string, prefix: string): string | undefined {
  const mark = `${prefix} – `;
  if (!title.startsWith(mark)) return undefined;
  const file = (path.split(/[\\/]/).pop() ?? '').replace(/\.(kalk|calc)$/i, '');
  return file.replace(mark, '').trim() || title.slice(mark.length);
}
