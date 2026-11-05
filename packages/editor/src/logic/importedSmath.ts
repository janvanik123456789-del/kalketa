import { defaultRegistry } from '@kalketa/core';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { importSmath, type SmathReport } from '@kalketa/import';
import { newDocument, type SheetDocument } from '@kalketa/sheet';

/** A worksheet of SMath as a new sheet: its original goes along, untouched, and it has no file of its own yet. */
export function importedSmath(name: string, bytes: Uint8Array, language: string): { document: SheetDocument; report: SmathReport } {
  const { source, report, images } = importSmath(new TextDecoder().decode(bytes), defaultRegistry, language);
  const fresh = newDocument(name.replace(/\.[^.]*$/, ''), source);
  return { document: { ...fresh, manifest: { ...fresh.manifest, language }, files: new Map([...fresh.files, ...images.map((i) => [i.path, i.bytes] as const), ['sources/original.sm', bytes]]) }, report };
}

/** The report of an import in words: its summary, then what needs a look, what differs first. */
export function importReportParts(catalog: Catalog, report: SmathReport): {
  summary: string[];
  sections: { kind: 'differ' | 'frozen' | 'renamed' | 'left'; title: string; lines: string[] }[];
} {
  const leftLine = (l: SmathReport['left'][number]): string => {
    const why = l.why.kind === 'error' ? l.why.code : l.why.kind === 'form' ? '' : l.why.name;
    return t(catalog, `import.left.${l.why.kind}` as UiKey, { written: l.written, why });
  };
  const sections = [
    { kind: 'differ' as const, title: t(catalog, 'import.report.differ'), lines: report.differ.map((d) => t(catalog, 'import.differs', { name: d.name, stored: d.stored, here: d.here, unit: d.unit })) },
    { kind: 'frozen' as const, title: t(catalog, 'import.report.frozen'), lines: report.frozen.length > 0 ? [t(catalog, 'import.frozen', { names: report.frozen.join(', ') })] : [] },
    {
      kind: 'renamed' as const,
      title: t(catalog, 'import.report.renamed'),
      lines: [...report.signs.map((r) => t(catalog, 'import.sign', { from: r.from, to: r.to })), ...report.renamed.map((r) => t(catalog, 'import.renamed', { from: r.from, to: r.to }))],
    },
    { kind: 'left' as const, title: t(catalog, 'import.report.left', { count: report.left.length }), lines: report.left.map(leftLine) },
  ];
  return {
    summary: [
      t(catalog, 'import.summary', { converted: report.converted, formulas: report.formulas, texts: report.texts }),
      t(catalog, 'import.compared', { agree: report.agree, differ: report.differ.length, other: report.notCompared }),
    ],
    sections: sections.filter((s) => s.lines.length > 0),
  };
}
