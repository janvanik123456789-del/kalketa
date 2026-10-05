import { describe, expect, it } from 'vitest';
import { exampleDocument, samples, savedSampleTitle } from '../src/samples.js';

describe('sample calculations shipped with the program', () => {
  it('are the reference cases, named after their first heading', () => {
    const list = samples();
    expect(list.map((s) => s.id)).toEqual(['R1-nosnik', 'R2-vymenik-hridel', 'R3-roztok', 'R4-kabel', 'R5-fotovoltaika', 'R6-fve']);
    expect(list[0]!.title).toBe('Posouzení nosníku N1');
  });

  it('open as a new document with their tables and a title that says it is a sample', () => {
    const doc = exampleDocument('R4-kabel');
    expect(doc.manifest.title).toBe('Vzor – Dimenzování kabelu a úbytek napětí');
    expect([...doc.tables.keys()].sort()).toEqual(['Kabely', 'Korekce']);
    for (const table of doc.tables.values()) expect(table.schemaJson && table.dataCsv).toBeTruthy();
    expect(exampleDocument().manifest.title).toBe('Vzor – Posouzení nosníku N1');
  });

  it('saved as a file of the user, take the file name without the sample prefix', () => {
    expect(savedSampleTitle('Vzor – Posouzení nosníku N1', 'E:\\Výpočty\\Nosník N7.kalk', 'Vzor')).toBe('Nosník N7');
    expect(savedSampleTitle('Vzor – Posouzení nosníku N1', 'E:/Výpočty/Vzor – Posouzení nosníku N1.kalk', 'Vzor')).toBe('Posouzení nosníku N1');
    expect(savedSampleTitle('Můj výpočet', 'E:/a.kalk', 'Vzor')).toBeUndefined();
  });
});
