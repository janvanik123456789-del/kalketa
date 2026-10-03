import { describe, expect, it } from 'vitest';
import { applySuspects, cleanPdfText, joinSpacedLetters } from '../src/logic/pdfText.js';

// Notes as a PDF copy leaves them: one paragraph per printed line.
const copied = [
  '3. NOSNÍKY A ZATÍŽENÍ',
  'Nosník je prvek n a m á h a n ý ohybem. Zatížení působí kolmo k ose a vyvolá',
  'ohybový moment, posouvající sílu a průhyb, které se posuzují každý zvlášť',
  'podle normy.',
  '17',
  '3.1 Spojité zatížení',
  'Zatížení je r o v n o m ě r n ě rozložené po celé délce nosníku, jak je běžné',
  'u stropních konstrukcí. Hodnota q udává zatížení na jednotku délky.',
  '![](layers/layer3/images/schema.png)',
  'Obr. 7 Prostý nosník: a) schéma, b) průběh momentu,',
  'c) průhybová čára',
  'Další text začíná novou větou a pokračuje do konce řádku bez tečky',
  'až sem.',
  'I l l l l ^ - m H x',
  'a) b)',
].join('\n\n');

describe('tidying text from a PDF', () => {
  const cleaned = cleanPdfText(copied);
  const shown = applySuspects(cleaned, new Set(cleaned.suspects.map((_, i) => i)));

  it('turns numbered titles into headings by their depth', () => {
    expect(shown).toContain('# 3. NOSNÍKY A ZATÍŽENÍ\n');
    expect(shown).toContain('## 3.1 Spojité zatížení\n');
    expect(cleaned.stats.headings).toBe(2);
  });

  it('joins printed lines into paragraphs and spaced-out letters into words', () => {
    expect(shown).toContain('Nosník je prvek namáhaný ohybem. Zatížení působí kolmo k ose a vyvolá ohybový moment, posouvající sílu a průhyb, které se posuzují každý zvlášť podle normy.');
    expect(shown).toContain('Zatížení je rovnoměrně rozložené');
    expect(cleaned.joinedWords).toEqual(['namáhaný', 'rovnoměrně']);
  });

  it('removes page numbers and puts a caption under its picture', () => {
    expect(shown).not.toMatch(/^17$/m);
    expect(shown).toContain('![Obr. 7 Prostý nosník: a) schéma, b) průběh momentu, c) průhybová čára](layers/layer3/images/schema.png)');
    expect(shown).toContain('Další text začíná novou větou a pokračuje do konce řádku bez tečky až sem.');
  });

  it('lists remains of figures and drops only those the user ticks', () => {
    expect(cleaned.suspects).toEqual([
      { text: 'I l l l l ^ - m H x', kind: 'scraps' },
      { text: 'a) b)', kind: 'scraps' },
    ]);
    expect(shown).not.toContain('I l l l');
    const kept = applySuspects(cleaned, new Set([0]));
    expect(kept).toContain('\n\na) b)');
    expect(kept).not.toContain('\u0000');
  });

  it('leaves what is already formatted as it is', () => {
    const notes = '## Hotový nadpis {#T1}\n\n- odrážka\n\n> ČSN EN 1990\n';
    expect(cleanPdfText(notes).text).toBe(notes);
  });
});

describe('spaced-out letters', () => {
  it('ends a word before a short ordinary word and before a capital', () => {
    expect(joinSpacedLetters('průřezy p ů v o d n í se ohnou').text).toBe('průřezy původní se ohnou');
    expect(joinSpacedLetters('značí s e M 0').text).toBe('značí s e M 0');
    expect(joinSpacedLetters('síly k o l m é na směr').text).toBe('síly kolmé na směr');
    expect(joinSpacedLetters('a v něm').text).toBe('a v něm');
  });
});

describe('numbered cases and formulas', () => {
  const copied = [
    '7. PROSTÝ OHYB',
    '7.5 Grafický průběh',
    'Úvodní věta podkapitoly.',
    '1. Vetknutý nosník s osamělou silou na volném konci',
    'Text prvního případu.',
    'F-l3 3-E-ľ (45)',
    '2. Vetknutý nosník se spojitým, rovnoměrně rozloženým břemenem v celé délce',
    'Text druhého případu, který odkazuje na podmínku (39).',
    '3. Prostý nosník na dvou podporách s jedinou osamělou silou',
    'působící v obecné poloze mezi podporami',
    'Mějme prostý nosník.',
    '8. KRUT',
    'Text další kapitoly.',
  ].join('\n\n');
  const cleaned = cleanPdfText(copied);
  const shown = applySuspects(cleaned, new Set());

  it('puts cases numbered on their own under the subchapter, and the next chapter at the top', () => {
    expect(shown.split('\n').filter((l) => l.startsWith('#'))).toEqual([
      '# 7. PROSTÝ OHYB',
      '## 7.5 Grafický průběh',
      '### 1. Vetknutý nosník s osamělou silou na volném konci',
      '### 2. Vetknutý nosník se spojitým, rovnoměrně rozloženým břemenem v celé délce',
      '### 3. Prostý nosník na dvou podporách s jedinou osamělou silou působící v obecné poloze mezi podporami',
      '# 8. KRUT',
    ]);
  });

  it('keeps a garbled formula apart and lists it, not to be removed unless the user says so', () => {
    expect(cleaned.suspects).toEqual([{ text: 'F-l3 3-E-ľ (45)', kind: 'formula' }]);
    expect(shown).toContain('\n\nF-l3 3-E-ľ (45)\n\n');
    expect(shown).toContain('odkazuje na podmínku (39).');
  });

  it('gives numbered headings already there their level, with their section ids', () => {
    const notes = '# 7. PROSTÝ OHYB {#T1}\n\n## 7.5 Grafický průběh {#T6}\n\n# 1. Vetknutý nosník {#T7}\n\nText.\n';
    expect(cleanPdfText(notes).text).toBe('# 7. PROSTÝ OHYB {#T1}\n\n## 7.5 Grafický průběh {#T6}\n\n### 1. Vetknutý nosník {#T7}\n\nText.\n');
  });
});
