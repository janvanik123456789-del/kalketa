/// <reference types="vite/client" />
/**
 * The sample calculations shipped with the program (File > Sample calculations):
 * the reference cases with their tables and pictures, each opened as a new document.
 */

import { newDocument, type SheetDocument, type StoredTable } from '@kalketa/sheet';

// The sample calculations shipped with the program: the reference cases with their tables.
// Sorted by field, in a subfield or not: reference/<field>/[<subfield>/]<case>/
// (03_Strojirenstvi_a_mechanika/01_Kinematika_a_dynamika/R9-klikovy-mechanismus, 04_…/R1-nosnik).
const SAMPLE_SHEETS = import.meta.glob<string>('../../../reference/*/**/*.cc', { query: '?raw', import: 'default', eager: true });
const SAMPLE_TABLES = import.meta.glob<string>('../../../reference/*/**/tables/*/{schema.json,data.csv}', { query: '?raw', import: 'default', eager: true });
// Its pictures, drawings of its own (images/mechanismus.svg in the sheet).
const SAMPLE_IMAGES = import.meta.glob<string>('../../../reference/*/**/images/*.svg', { query: '?raw', import: 'default', eager: true });
// The names of a subfield, kept beside its cases: nazev.json {"cs": "Kinematika a dynamika", "en": "Kinematics and dynamics"}.
const SUBFIELD_NAMES = import.meta.glob<string>('../../../reference/*/*/nazev.json', { query: '?raw', import: 'default', eager: true });

/**
 * The fields the samples are sorted into, by the number their folder starts with
 * (03_Strojirenstvi_a_mechanika is 03); their names come from the catalog (samples.field.03).
 */
export const SAMPLE_FIELDS = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '99'] as const;
export type SampleField = (typeof SAMPLE_FIELDS)[number];
/** Variants of a case kept for the tests only. */
const TEST_VARIANTS = new Set(['bez-tabulek']);
export const DEFAULT_SAMPLE = 'R1-nosnik';

export interface Sample {
  /** The folder of the case ("R1-nosnik"). */
  readonly id: string;
  /** The field it is sorted into ("04": building and civil engineering). */
  readonly field: SampleField;
  /** The part of the field it is in, when the field is split (03 into 01 Kinematika a dynamika…). */
  readonly subfield?: Subfield;
  /** Its first heading ("Posouzení nosníku N1"). */
  readonly title: string;
  /** The language of its printout: a sheet named *.en.cc is in English, the others in Czech. */
  readonly language: string;
}

/** A part of a field: its folder (01_Kinematika_a_dynamika) and its names by language. */
export interface Subfield {
  readonly folder: string;
  readonly names: Readonly<Record<string, string>>;
}

/** The name of a subfield in a language, Czech when it has none in that one. */
export function subfieldName(subfield: Subfield, language: string): string {
  return subfield.names[language] ?? subfield.names['cs'] ?? subfield.folder.replace(/^\d+_/, '').replace(/_/g, ' ');
}

/** The case of a path under reference/: its field folder, its subfield folder if any, its own folder and file. */
function placeOf(path: string): { field: SampleField | undefined; subfield?: string; id: string; file: string } | undefined {
  const parts = /\/reference\/(.+)$/.exec(path)?.[1]?.split('/');
  if (!parts || parts.length < 3 || parts.length > 4) return undefined;
  const file = parts[parts.length - 1]!;
  return { field: SAMPLE_FIELDS.find((f) => parts[0]!.startsWith(`${f}_`)), ...(parts.length === 4 ? { subfield: parts[1]! } : {}), id: parts[parts.length - 2]!, file };
}

/** The sample calculations, by field, then by subfield (those directly in the field first), then in the order of their folders. */
export function samples(): Sample[] {
  const subfields = new Map(
    Object.entries(SUBFIELD_NAMES).map(([path, text]) => {
      const folder = /\/([^/]+)\/nazev\.json$/.exec(path)![1]!;
      let names: Record<string, string> = {};
      try {
        names = JSON.parse(text) as Record<string, string>;
      } catch {
        // A name that cannot be read: the folder name stands for it.
      }
      return [path.replace(/\/nazev\.json$/, ''), { folder, names }] as const;
    }),
  );
  return Object.entries(SAMPLE_SHEETS)
    .flatMap(([path, source]): Sample[] => {
      const place = placeOf(path);
      if (!place?.field || TEST_VARIANTS.has(place.file.replace(/\.cc$/, ''))) return [];
      const subfield = place.subfield === undefined ? undefined : (subfields.get(path.slice(0, path.indexOf(`/${place.subfield}/`) + place.subfield.length + 1)) ?? { folder: place.subfield, names: {} });
      const file = place.file.replace(/\.cc$/, '');
      return [{ id: place.id, field: place.field, ...(subfield ? { subfield } : {}), title: /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? place.id, language: languageOf(file) }];
    })
    .sort((a, b) => a.field.localeCompare(b.field) || (a.subfield?.folder ?? '').localeCompare(b.subfield?.folder ?? '') || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

/**
 * A sample calculation as a new, unsaved document. Its title says it is a
 * sample, so saving it never offers the name of the user's own calculation.
 */
export function exampleDocument(id = DEFAULT_SAMPLE, prefix = 'Vzor'): SheetDocument {
  const entry = Object.entries(SAMPLE_SHEETS).find(([path]) => path.includes(`/${id}/`) && !TEST_VARIANTS.has(/([^/]+)\.cc$/.exec(path)?.[1] ?? ''));
  const source = entry?.[1] ?? '';
  const title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? id;
  const base = newDocument(`${prefix} – ${title}`, source);
  const tables = new Map<string, StoredTable>();
  for (const [path, text] of Object.entries(SAMPLE_TABLES)) {
    const [, folder, name, file] = /\/([^/]+)\/tables\/([^/]+)\/([^/]+)$/.exec(path) ?? [];
    if (folder !== id || !name) continue;
    const table = tables.get(name) ?? { schemaJson: '', dataCsv: '' };
    tables.set(name, file === 'schema.json' ? { ...table, schemaJson: text } : { ...table, dataCsv: text });
  }
  const files = new Map(base.files);
  for (const [path, text] of Object.entries(SAMPLE_IMAGES)) {
    const [, folder, name] = /\/([^/]+)\/images\/([^/]+)$/.exec(path) ?? [];
    if (folder === id && name) files.set(`images/${name}`, new TextEncoder().encode(text));
  }
  const file = /([^/]+)\.cc$/.exec(entry?.[0] ?? '')?.[1] ?? '';
  return { ...base, manifest: { ...base.manifest, language: languageOf(file) }, tables, files };
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
