import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  addLayer,
  checkTheoryLibrary,
  defaultLayers,
  keyOf,
  libraryFromLayer,
  librarySections,
  linkedLibraries,
  linkFor,
  newDocument,
  readSheetFile,
  readTheoryLibrary,
  updateLayer,
  withCitedSections,
  withLibraryLink,
  withoutLibraryLink,
  writeSheetFile,
  writeTheoryLibrary,
} from '../src/index.js';

const text = '## Klopení {#T1}\n\nKlopení je ztráta stability.\n\n![Obr. 1 Nosník](layers/layer3/images/nosnik.png)\n\n## Průhyb {#T2}\n\nLimit je L/250.\n';
const added = addLayer(defaultLayers(), 'sources', 'Podklady');
const layer = updateLayer(added.layers, added.id, { text })[2]!;
const picture = new Uint8Array([137, 80, 78, 71]);
const meta = { key: 'PP', version: '1', title: 'Pružnost a pevnost', source: { title: 'Pružnost a pevnost I', edition: '2. vyd.', pages: '41–43' }, language: 'cs', shareable: false };

describe('theory library .kalkt', () => {
  const library = libraryFromLayer(layer, new Map([['layers/layer3/images/nosnik.png', picture]]), meta, new Date('2026-10-03T12:00:00Z'));

  it('is made from a sources layer, its pictures moved inside it', () => {
    expect(library.text).toContain('![Obr. 1 Nosník](images/nosnik.png)');
    expect([...library.files.keys()]).toEqual(['images/nosnik.png']);
    expect(library.manifest).toMatchObject({ format: 'kalketa-theory', formatVersion: 1, key: 'PP', created: '2026-10-03T12:00:00.000Z' });
    expect(librarySections(library).map((s) => `${s.id} ${s.title}`)).toEqual(['PP:T1 Klopení', 'PP:T2 Průhyb']);
  });

  it('is checked before it is written: source and headings are required', () => {
    expect(checkTheoryLibrary(library)).toEqual([]);
    const bare = { ...library, manifest: { ...library.manifest, key: 'pp', source: { title: '' } }, text: 'Jen text bez nadpisů.' };
    expect(checkTheoryLibrary(bare).map((p) => p.code)).toEqual(['noSource', 'badKey', 'noHeadings']);
    const long = { ...library, text: `## Dlouhý {#T1}\n\n${'slovo '.repeat(1300)}` };
    expect(checkTheoryLibrary(long)).toEqual([{ code: 'longSection', level: 'warning', section: 'Dlouhý', chars: 7799 }]);
    expect(keyOf('Pružnost a pevnost')).toBe('PP');
    expect(keyOf('EN 1993-1-1 Navrhování ocelových konstrukcí')).toBe('ENOK');
  });

  it('round-trips with its content hash and search index', async () => {
    const bytes = await writeTheoryLibrary(library, (t) => t.toLowerCase().split(/\W+/u).filter((w) => w.length > 3));
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['images/nosnik.png', 'index.json', 'manifest.json', 'theory.md']);
    const index = JSON.parse(new TextDecoder().decode(entries['index.json']));
    expect(index.sections[0]).toMatchObject({ id: 'PP:T1', title: 'Klopení' });
    const read = await readTheoryLibrary(bytes);
    expect('library' in read && read.library.text).toBe(library.text);
    expect('library' in read && read.library.manifest.contentHash).toMatch(/^sha256:/);
  });

  it('refuses a changed text, a newer format and what is not a library', async () => {
    const entries = unzipSync(await writeTheoryLibrary(library));
    entries['theory.md'] = strToU8('## Podvržený {#T1}\n\nJiný text.');
    expect(await readTheoryLibrary(zipSync(entries))).toEqual({ problem: 'damaged' });
    const manifest = JSON.parse(new TextDecoder().decode(unzipSync(await writeTheoryLibrary(library))['manifest.json']));
    expect(await readTheoryLibrary(zipSync({ 'manifest.json': strToU8(JSON.stringify({ ...manifest, formatVersion: 9 })), 'theory.md': strToU8('x') }))).toEqual({ problem: 'newer' });
    expect(await readTheoryLibrary(await writeSheetFile(newDocument('N1')))).toEqual({ problem: 'notLibrary' });
    expect(await readTheoryLibrary(new Uint8Array([1, 2, 3]))).toEqual({ problem: 'notZip' });
  });

  it('is linked from a sheet with copies of the cited sections, kept by the sheet file', async () => {
    let doc = withLibraryLink(newDocument('N1'), linkFor(library));
    const cited = librarySections(library).filter((s) => s.id === 'PP:T2') as { id: string; title: string; text: string }[];
    doc = withLibraryLink(doc, withCitedSections(linkedLibraries(doc)[0]!, cited));
    const read = await readSheetFile(await writeSheetFile(doc));
    const links = linkedLibraries(read.document!);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ key: 'PP', title: 'Pružnost a pevnost', sections: [{ id: 'PP:T2', title: 'Průhyb', text: 'Limit je L/250.' }] });
    expect(withCitedSections(links[0]!, cited)).toBe(links[0]);
    expect(linkedLibraries(withoutLibraryLink(read.document!, library.manifest.id))).toEqual([]);
  });
});
