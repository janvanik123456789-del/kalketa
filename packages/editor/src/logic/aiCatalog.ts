/**
 * What the model may look up (packages/ai/src/lookups.ts): the catalog of the formula library and the samples, and
 * the text of the items it asks for. The program carries both; the model reads only what it asks for.
 */
import { MAX_SAMPLE_CHARS, type CatalogItem, type LookupRequest } from '@kalketa/ai';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { sides, text, type Entry, type Language } from '@kalketa/library';

/** A sample as the catalog needs it. */
export interface CatalogSample {
  readonly id: string;
  readonly field: string;
  readonly title: string;
}

function languageOf(catalog: Catalog): Language {
  return catalog.locale.startsWith('cs') ? 'cs' : 'en';
}

/** The catalog: every formula of the library, every sample in the language of the user, by field. */
export function catalogItems(formulas: readonly Entry[], samples: readonly CatalogSample[], catalog: Catalog): CatalogItem[] {
  const language = languageOf(catalog);
  const field = (f: string) => t(catalog, `samples.field.${f}` as UiKey);
  return [
    ...formulas.map((e): CatalogItem => ({ kind: 'formula', id: e.id, title: text(e.title, language), group: `${field(e.field)} – ${text(e.group, language)}`, formula: e.formula })),
    ...samples.map((s): CatalogItem => ({ kind: 'sample', id: s.id, title: s.title, group: field(s.field) })),
  ];
}

/** The text of one formula for the model: the equation, its quantities, the example and the source. */
export function formulaText(entry: Entry, catalog: Catalog): string {
  const language = languageOf(catalog);
  const [left] = sides(entry);
  const quantities = Object.entries(entry.quantities).map(([name, q]) => `- ${name}: ${text(q.name, language)} [${q.unit}], ${t(catalog, 'lookup.example')} ${q.example}`);
  const checks = entry.checks.map((c) => `- ${Object.entries(c.given).map(([n, v]) => `${n} = ${v}`).join(', ')} → ${Object.entries(c.expect).map(([n, v]) => `${n} = ${v}`).join(', ')}`);
  return [
    `### ${t(catalog, 'lookup.formula')} ${entry.id}: ${text(entry.title, language)}`,
    `${text(entry.group, language)} · ${t(catalog, `formulaLib.status.${entry.status}` as UiKey)}`,
    '```kalketa',
    entry.formula,
    '```',
    `${t(catalog, 'lookup.quantities')} (${t(catalog, 'lookup.sought', { name: left })}):`,
    ...quantities,
    ...(checks.length > 0 ? [`${t(catalog, 'lookup.checks')}:`, ...checks] : []),
    t(catalog, 'formulaLib.source', { source: `${text(entry.source.text, language)}${entry.source.sample ? ` (${entry.source.sample})` : ''}` }),
  ].join('\n');
}

/** The text of one sample for the model: its sheet, cut when it is very long. */
export function sampleText(id: string, title: string, source: string, catalog: Catalog): string {
  const cut = source.length > MAX_SAMPLE_CHARS;
  return [`### ${t(catalog, 'lookup.sample')} ${id}: ${title}`, '```kalketa', cut ? source.slice(0, MAX_SAMPLE_CHARS) : source, '```', ...(cut ? [t(catalog, 'lookup.cut', { chars: String(MAX_SAMPLE_CHARS) })] : [])].join('\n');
}

/** The message that answers what the model asked for; its first line says what was sent (the chat shows it folded). */
export function lookupAnswer(
  asked: readonly LookupRequest[],
  find: { formula(id: string): Entry | undefined; sample(id: string): { title: string; source: string } | undefined },
  catalog: Catalog,
): { text: string; found: number } {
  const parts: string[] = [];
  const names: string[] = [];
  const missing: string[] = [];
  for (const a of asked) {
    if (a.kind === 'formula') {
      const entry = find.formula(a.id);
      if (entry) {
        parts.push(formulaText(entry, catalog));
        names.push(`${t(catalog, 'lookup.formula')} ${a.id}`);
      } else missing.push(`formula ${a.id}`);
    } else {
      const sample = find.sample(a.id);
      if (sample) {
        parts.push(sampleText(a.id, sample.title, sample.source, catalog));
        names.push(`${t(catalog, 'lookup.sample')} ${a.id}`);
      } else missing.push(`sample ${a.id}`);
    }
  }
  const head = `**${t(catalog, 'lookup.title')}** ${names.length > 0 ? names.join(', ') : '–'}`;
  return {
    text: [head, ...parts, ...(missing.length > 0 ? [t(catalog, 'lookup.missing', { items: missing.join(', ') })] : []), t(catalog, 'lookup.goOn')].join('\n\n'),
    found: names.length,
  };
}
