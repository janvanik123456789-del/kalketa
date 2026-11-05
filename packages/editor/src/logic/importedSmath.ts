import { defaultRegistry } from '@kalketa/core';
import { importSmath, type SmathReport } from '@kalketa/import';
import { newDocument, type SheetDocument } from '@kalketa/sheet';

/** A worksheet of SMath as a new sheet: its original goes along, untouched, and it has no file of its own yet. */
export function importedSmath(name: string, bytes: Uint8Array, language: string): { document: SheetDocument; report: SmathReport } {
  const { source, report, images } = importSmath(new TextDecoder().decode(bytes), defaultRegistry, language);
  const fresh = newDocument(name.replace(/\.[^.]*$/, ''), source);
  return { document: { ...fresh, manifest: { ...fresh.manifest, language }, files: new Map([...fresh.files, ...images.map((i) => [i.path, i.bytes] as const), ['sources/original.sm', bytes]]) }, report };
}
