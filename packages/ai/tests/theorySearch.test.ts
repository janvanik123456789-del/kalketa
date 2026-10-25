import { describe, expect, it } from 'vitest';
import { prepareBriefing, selectTheory, terms } from '@kalketa/ai';

// A theory larger than what goes whole: twenty sections of filler and a few on the subject.
const filler = (n: number) => ({ id: `T${n}`, title: `Kapitola ${n}`, text: 'Obecný text o historii stavebnictví a výrobě oceli v hutích. '.repeat(12) });
const theory = [
  ...Array.from({ length: 20 }, (_, i) => filler(i + 1)),
  { id: 'T21', title: 'Klopení', text: 'Klopení je ztráta stability ohýbaného nosníku. Tlačený pas se vybočí a průřez se zkroutí.' },
  { id: 'T22', title: 'Průhyb', text: 'Průhyb nosníků se omezuje hodnotou L/250 od proměnného zatížení.' },
  { id: 'T23', title: 'Smyk', text: 'Smykové napětí ve stojině se posuzuje u podpor.' },
];

describe('finding the theory for a question', () => {
  it('sends small theory whole', () => {
    const small = theory.slice(20);
    expect(selectTheory(small, 'cokoli')).toEqual({ sections: small, whole: true, total: 3 });
  });

  it('picks the sections that share words with the question, in any Czech form', () => {
    const picked = selectTheory(theory, 'Je potřeba posoudit klopení u tohoto nosníku?');
    expect(picked.whole).toBe(false);
    expect(picked.total).toBe(23);
    expect(picked.sections.map((s) => s.id).slice(0, 2)).toEqual(['T21', 'T22']);
    expect(selectTheory(theory, 'Jaký je limit průhybu?').sections.map((s) => s.id)).toEqual(['T22']);
  });

  it('keeps sections cited before in the conversation', () => {
    expect(selectTheory(theory, 'A smyk?', ['T21']).sections.map((s) => s.id)).toEqual(['T21', 'T23']);
  });

  it('compares words by their stem, without diacritics and filler words', () => {
    expect(terms('Nosník, nosníku a nosníky')).toEqual(['nosni', 'nosni', 'nosni']);
    expect(terms('je to u ohybem')).toEqual(['ohybe']);
  });

  it('gives the model the contents and the chosen sections, and says which went', () => {
    const prepared = prepareBriefing({ language: 'cs', sheet: { title: 'N1', source: 'L := 5 m', theory }, query: 'klopení' });
    expect(prepared.theory).toEqual({ sent: ['T21'], total: 23, whole: false });
    expect(prepared.text).toContain('[T22] Průhyb\n');
    expect(prepared.text).toContain('[T21] Klopení\nKlopení je ztráta stability');
    expect(prepared.text).not.toContain('Průhyb nosníků se omezuje');
  });
});

describe('a new calculation from its intent', () => {
  it('tells the model to ask first, agree an outline, and write the sheet only then', () => {
    const plain = prepareBriefing({ language: 'cs', sheet: { title: 'N1', source: '# N1' } }).text;
    const intent = prepareBriefing({ language: 'cs', sheet: { title: 'N1', source: '# N1' }, intent: true }).text;
    expect(plain).not.toContain('starts a new calculation from its intent');
    expect(intent).toContain('starts a new calculation from its intent');
    expect(intent).toContain('Předmět výpočtu:');
  });
});
