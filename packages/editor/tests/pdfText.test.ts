import { describe, expect, it } from 'vitest';
import { applySuspects, cleanPdfText, fromSymbolFont, joinedAccents, joinSpacedLetters, ocrNoise, plainMathLetters, shifted } from '../src/logic/pdfText.js';

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

describe('characters of a PDF', () => {
  it('reads a Symbol font given in the private use area', () => {
    expect(fromSymbolFont('M  0')).toBe('M = 0');
    expect(fromSymbolFont('4,8633      ')).toBe('−4,8633 ⋅ α° ≤ ≠ ∫ ∑');
    // Every code from 0x20 to 0x7E and from 0xA0 to 0xFE has its character (0xF0 none).
    for (let c = 0x20; c <= 0xfe; c++) if (c < 0x7f || c >= 0xa0) expect(fromSymbolFont(String.fromCharCode(0xf000 + c)).length).toBe(c === 0xf0 ? 0 : 1);
    expect(fromSymbolFont('obyčejný text')).toBe('obyčejný text');
  });

  it('writes exponents and indexes', () => {
    expect(shifted('-6', true)).toBe('⁻⁶');
    expect(shifted('2', true)).toBe('²');
    expect(shifted('x+1', true)).toBe('^(x+1)');
    expect(shifted('max', false)).toBe('_max');
    expect(shifted('h, a-b', false)).toBe('_(h, a-b)');
  });
});

describe('worked examples and captions', () => {
  it('start a heading at "Příklad 1", "Problem 2. …", "Example 1. …"', () => {
    const cleaned = cleanPdfText(['## Kapitola', '', 'Příklad 1', '1 kg plynu při izobarickém ohřevu vykonal práci.', '', 'Problem 2. Diameter of pipe to give a given discharge.', 'Required the diameter of a pipe.', '', 'Example 1. A pipe 3 inches diameter 200 ft. long connects two tanks, the', 'difference of level is 10 feet.'].join('\n')).text;
    expect(cleaned).toContain('### Příklad 1\n\n1 kg plynu');
    expect(cleaned).toContain('### Problem 2 Diameter of pipe to give a given discharge\n\nRequired');
    expect(cleaned).toContain('### Example 1\n\nA pipe 3 inches diameter 200 ft. long connects two tanks, the difference of level is 10 feet.');
    expect(cleanPdfText('Příklad č. 2:\nVodní potrubí se náhle rozšiřuje.').text).toBe('## Příklad 2\n\nVodní potrubí se náhle rozšiřuje.\n');
    // Numbered by chapter: "Příklad IV-5:", "Příklad 9.1.", "Aufgabe 2.3:".
    expect(cleanPdfText('Příklad IV-5: V daném obvodu vypočtěte proud.').text).toBe('## Příklad IV-5\n\nV daném obvodu vypočtěte proud.\n');
    expect(cleanPdfText('Aufgabe 2.3:\nDas Verschlußorgan verhindert das Eindringen.').text).toContain('## Aufgabe 2.3\n\n');
    // A numbered task is a sentence of many words, not a title.
    expect(cleanPdfText('4.13 Pro daný obvod formulujte rovnici metodou uzlových napětí a vypočtěte').text).not.toMatch(/^#/);
  });

  it('take a formula of a math font mapped to wrong letters for a suspect formula', () => {
    const garbled = 'ܸ ஺ ݓ = ஺ ܵ∙ ஺ ݓ → ஺ ܸ = 5,66 ݉ ݏ';
    expect(cleanPdfText(['Ze znalosti průtoku určíme rychlost:', garbled].join('\n')).suspects).toEqual([{ text: garbled, kind: 'formula' }]);
    expect(cleanPdfText('Napětí σ = 120 MPa, λ = 0,02, Δp = 5 kPa.').suspects).toEqual([]);
  });

  it('take "Obr.: …" without a number for a caption, not a part of the paragraph', () => {
    const cleaned = cleanPdfText(['Modul pružnosti E = 210 GPa, moment setrvačnosti I = 21,4·10⁻⁶ m⁴.', 'Obr.: Model konstrukce a zatížení'].join('\n')).text;
    expect(cleaned).toBe('Modul pružnosti E = 210 GPa, moment setrvačnosti I = 21,4·10⁻⁶ m⁴.\n\nObr.: Model konstrukce a zatížení\n');
  });
});

describe('text of a scan', () => {
  it('marks formulas the text recognition garbled, not sentences with degrees or quotes', () => {
    expect(ocrNoise("t ui'^\\*¥ ^«^°''^*y i^ °?' ''^°'\"'' *^e coefficient 0 cannot be obtained from the")).toBe(true);
    expect(ocrNoise("''=6-oSr7=^-«««\"-^^=°-")).toBe(true);
    expect(ocrNoise('l~dKv.')).toBe(false);
    expect(ocrNoise('Plyn se ohřeje z 40 °C na 750 °C, „izobaricky“ při tlaku 0,1 MPa.')).toBe(false);
    const cleaned = cleanPdfText(['Then', "''=6-oSr7=^-«««\"-^^=°-", 'The head lost due to friction is'].join('\n'));
    expect(cleaned.suspects).toEqual([{ text: "''=6-oSr7=^-«««\"-^^=°-", kind: 'formula' }]);
  });
});

describe('mathematical letters', () => {
  it('become plain letters, nothing else changes', () => {
    // Word's 𝑚̇ is a letter and a combining dot: m with the dot, as a name of the calculation writes it.
    expect(plainMathLetters('𝜎 𝑥 = 80 𝑀𝑃𝑎, 𝜏 𝑥𝑦 = 40 𝑀𝑃𝑎, 𝑚̇, 𝜅')).toBe('σ x = 80 MPa, τ xy = 40 MPa, ṁ, κ');
    expect(plainMathLetters('Napětí σ = 80 MPa, ½, ²')).toBe('Napětí σ = 80 MPa, ½, ²');
  });
});

describe('accents set as characters of their own', () => {
  it('go onto their letters', () => {
    expect(joinedAccents('Vzorový pˇríklad ˇc. 9')).toBe('Vzorový příklad č. 9');
    expect(joinedAccents('stanovte pr ˚ubˇehy vnitˇrních sil')).toBe('stanovte průběhy vnitřních sil');
    expect(joinedAccents('odebraných stup ˇn ˚u volnosti')).toBe('odebraných stupňů volnosti');
    expect(joinedAccents('Rešeníˇ reakcí')).toBe('Řešení reakcí');
  });

  it('leave an apostrophe and a lone mark be', () => {
    expect(joinedAccents('don´t')).toBe('don´t');
    expect(joinedAccents('úhel 30˚')).toBe('úhel 30˚');
  });
});
