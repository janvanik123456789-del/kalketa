import { describe, expect, it } from 'vitest';
import { exampleDocument, samples, savedSampleTitle, subfieldName } from '../src/samples.js';

describe('sample calculations shipped with the program', () => {
  it('are the reference cases, named after their first heading', () => {
    const list = samples();
    expect(list.map((s) => `${s.field} ${s.id}`)).toEqual([
      '00 R24-pruvodce-police',
      '01 R7-kvadraticka-rovnice',
      '01 R8-quadratic-equation',
      '01 R17-prolozeni-parabolou',
      '01 R19-plochy-3d',
      '02 R10-stlaceni-hydrostatickym-tlakem',
      '02 R13-rychlost-z-namereneho-zrychleni',
      '02 R23-prechazeni-po-lodce',
      '03 R9-klikovy-mechanismus',
      '03 R16-raketa',
      '03 R11-napeti-v-nosniku',
      '03 R12-prodlouzeni-dratu',
      '03 R22-kmitani-dvou-hmot',
      '03 R14-sila-vody-na-hraz',
      '03 R15-vytok-z-nadrze',
      '03 R21-ztraty-v-potrubi',
      '03 R2-vymenik-hridel',
      '04 R1-nosnik',
      '04 R20-deska-ohyb',
      '05 R4-kabel',
      '05 R18-termistor-interpolace',
      '06 R6-fve',
      '07 R3-roztok',
      '11 R25-ztrata-vetranim',
      '16 R5-fotovoltaika',
    ]);
    expect(list.find((s) => s.id === 'R1-nosnik')!.title).toBe('Posouzení nosníku N1');
    // A field split into parts: the part with its names (cs, en); a case right in its field has none.
    const crank = list.find((s) => s.id === 'R9-klikovy-mechanismus')!;
    expect(crank.subfield).toMatchObject({ folder: '01_Kinematika_a_dynamika', names: { cs: 'Kinematika a dynamika', en: 'Kinematics and dynamics' } });
    expect(subfieldName(crank.subfield!, 'en')).toBe('Kinematics and dynamics');
    expect(list.find((s) => s.id === 'R1-nosnik')!.subfield).toBeUndefined();
  });

  it('print in the language of their sheet: a sheet named *.en.cc in English', () => {
    expect(samples().find((s) => s.id === 'R8-quadratic-equation')).toMatchObject({ title: 'Quadratic equation', language: 'en' });
    expect(exampleDocument('R8-quadratic-equation').manifest.language).toBe('en');
    // A sample brings its own pictures, at the paths its sheet gives.
    const crank = exampleDocument('R9-klikovy-mechanismus');
    const pictures = [...crank.source.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
    expect(pictures).toHaveLength(4);
    for (const path of pictures) expect(new TextDecoder().decode(crank.files.get(path))).toContain('<svg');
    expect(exampleDocument('R7-kvadraticka-rovnice').manifest).toMatchObject({ language: 'cs', title: 'Vzor – Kvadratická rovnice' });
    // A sample with theory brings it as a sources layer.
    const tank = exampleDocument('R15-vytok-z-nadrze');
    expect(tank.layers.find((l) => l.kind === 'sources')?.text).toContain('## Bernoulliho rovnice');
    expect(exampleDocument('R1-nosnik').layers.some((l) => l.kind === 'sources')).toBe(false);
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
