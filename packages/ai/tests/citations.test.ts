import { describe, expect, it } from 'vitest';
import { briefing, checkCitations } from '@kalketa/ai';

const theory = [
  { title: 'Úvod', text: 'Bez nadpisu.' },
  { id: 'T1', title: 'Klopení', text: 'Klopení je ztráta stability ohýbaného nosníku, při které se průřez vybočí a zkroutí.' },
  { id: 'T2', title: 'Průhyb', text: 'Doporučený limit průhybu stropních nosníků je L/250.' },
];

describe('citations', () => {
  it('accepts a section that exists, and words that are in it', () => {
    expect(checkCitations('Jde o klopení [T1]. Platí „limit průhybu stropních nosníků je L/250“ [T2].', theory)).toEqual([
      { id: 'T1', status: 'ok' },
      { id: 'T2', status: 'ok', quote: 'limit průhybu stropních nosníků je L/250' },
    ]);
  });

  it('marks a section that does not exist, and a quote that is not in it', () => {
    expect(checkCitations('Podle "boční vykloubení nosníku" [T1] a [T7].', theory)).toEqual([
      { id: 'T1', status: 'misquoted', quote: 'boční vykloubení nosníku' },
      { id: 'T7', status: 'unknown' },
    ]);
  });

  it('forgives changed spaces, dashes and case in a quote', () => {
    expect(checkCitations('"Ztráta  stability ohýbaného\nnosníku" [T1]', theory)[0]!.status).toBe('ok');
  });
});

describe('briefing with theory', () => {
  it('lists the sections with their ids and asks for checked citations', () => {
    const text = briefing({ language: 'cs', sheet: { title: 'N1', source: 'L := 5 m', theory } });
    expect(text).toContain('[T1] Klopení\nKlopení je ztráta stability');
    expect(text).toContain('Úvod\nBez nadpisu.');
    expect(text).toContain('quote them verbatim in quotation marks right before the citation');
  });

  it('says nothing about theory when the sheet has none', () => {
    expect(briefing({ language: 'cs', sheet: { title: 'N1', source: 'L := 5 m' } })).not.toContain('Theory and references');
  });
});
