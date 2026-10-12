import { describe, expect, it } from 'vitest';
import { buildTable, defaultRegistry, evaluateSheet, type Table } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, textHtml, toText } from '../src/index.js';

const cs = catalogFor('cs');
const plain = (text: string) => text.replace(/\s+/g, ' ');

function tables(): Table[] {
  const make = (name: string, rows: string[][]) =>
    buildTable({ name, columns: [{ name: 'typ', type: 'text' }, { name: 'cena', type: 'quantity', unit: 'CZK' }] }, rows, defaultRegistry).table;
  return [make('Stridace', [['S-10', '45000']]), make('Kabely', [['SOLAR 4', '32']])];
}

function lines(source: string, index = -1): string[] {
  const doc = buildPrintDocument(evaluateSheet(source, { tables: tables() }), { catalog: cs, registry: defaultRegistry, digits: 6, title: 'T' });
  const block = doc.blocks.at(index)!;
  return block.kind === 'equation' ? block.lines.map((l) => plain(`${l.lhs ? `${toText(l.lhs)} = ` : ''}${toText(l.rhs)}`)) : [];
}

describe('readable printouts', () => {
  it('tell the same column of two rows apart', () => {
    const [formula] = lines('s := pick(Stridace, "S-10")\nk := pick(Kabely, "SOLAR 4")\nC := s.cena + 60·k.cena');
    expect(formula).toBe('C = cena(s)+60·cena(k)');
  });

  it('do not repeat a name taken over from a column of the same name', () => {
    expect(lines('s := pick(Stridace, "S-10")\ncena := s.cena')).toEqual(['cena = 45 000 CZK']);
  });

  it('print a date once', () => {
    expect(lines('d := 2026-10-03')).toEqual(['d = 3. 10. 2026']);
  });

  it('print a unit after a name without parentheses', () => {
    expect(lines('kurz := 24.7\nunit EUR := kurz·CZK')[0]).toBe('1 EUR = kurz CZK');
  });
});

describe('text with indexes', () => {
  it('writes names with an index and powers as in a formula, the rest as text', () => {
    const html = textHtml('Mez kluzu σ_Kt a plocha S_min v mm^2, ne < a > ani snake case bez indexu.');
    expect(html).toContain('<math display="inline"><msub><mi>σ</mi><mi mathvariant="normal">Kt</mi></msub></math>');
    expect(html).toContain('<msup><mi mathvariant="normal">mm</mi><mn>2</mn></msup>');
    expect(html).toContain('Mez kluzu ');
    expect(html).toContain('ne &lt; a &gt; ani');
  });
});

describe('vectors', () => {
  it('put the arrow written after a letter over the name with its index, in formulas and in text', () => {
    const html = textHtml('Hybnost p⃗_1 a rychlost v⃗.');
    expect(html).toContain('<mover><msub><mi>p</mi><mn>1</mn></msub><mo stretchy="false">→</mo></mover>');
    expect(html).toContain('<mover><mi>v</mi><mo stretchy="false">→</mo></mover>');
    const sheet = evaluateSheet('m_s := 0.01 kg\nv⃗_1 := 400 m/s\np⃗_1 := m_s·v⃗_1');
    expect(sheet.diagnostics).toEqual([]);
    const lines = buildPrintDocument(sheet, { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'V' }).blocks.flatMap((b) => (b.kind === 'equation' ? b.lines : []));
    expect(lines.map((l) => (l.lhs ? toText(l.lhs) : ''))).toContain('vec(p_1)');
  });
});

describe('format of a line', () => {
  const lines = (source: string) =>
    buildPrintDocument(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'F' })
      .blocks.flatMap((b) => (b.kind === 'equation' ? b.lines : []))
      .map((l) => toText(l.rhs).replace(/\s+/g, ' '));

  it('shows a result with its decimals, in its line and in every substitution below; the calculation stays exact', () => {
    const shown = lines('S := 23.5294 mm² {decimals=2}\nd := √(4·S/π) | mm  {digits=3}  \' průměr\nk := d/(1 mm)');
    expect(shown).toContain('23,53 mm²');
    expect(shown).toContain('√((4·23,53 mm²)/π)');
    expect(shown).toContain('5,47 mm');
    // d substituted with its own three digits; k from the exact d.
    expect(shown).toContain('(5,47 mm)/(1 mm)');
    expect(shown.at(-1)).toBe('5,473');
  });

  it('reports a format it does not know and leaves the line as it was', () => {
    const sheet = evaluateSheet('a := 1.23456 {decimals=x}');
    expect(sheet.diagnostics.map((d) => d.code)).toEqual(['W-FORMAT']);
    expect(sheet.statements[0]!.display!.value).toBeCloseTo(1.23456);
  });
});

describe('style of a text line', () => {
  it('prints the size, font, italic and bold the line sets, and nothing more', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('"Volíme nýt 6 mm." {size=12 italic font=serif}\n"Obyčejný text."'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' });
    expect(html).toContain('<p class="text" style="font-size: 12pt; font-family: &quot;Cambria&quot;, &quot;Times New Roman&quot;, serif; font-style: italic">Volíme nýt 6 mm.</p>');
    expect(html).toContain('<p class="text">Obyčejný text.</p>');
    expect(evaluateSheet('"Text" {size=100 underline}').diagnostics.map((d) => d.code)).toEqual(['W-FORMAT', 'W-FORMAT']);
  });

  it('prints a part of a text in a colour of its own', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('"Mez {red}**kluzu**{/} oceli"'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' });
    expect(html).toContain('<p class="text">Mez <span style="color: #b3261e"><strong>kluzu</strong></span> oceli</p>');
    const any = printHtml(evaluateSheet('"Mez {#7030A0}kluzu{/}" {color=#c00000}'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' });
    expect(any).toContain('<p class="text" style="color: #c00000">Mez <span style="color: #7030a0">kluzu</span></p>');
    expect(evaluateSheet('"T" {color=#12345}').diagnostics.map((d) => d.code)).toEqual(['W-FORMAT']);
  });

  it('prints a font of the system by its name, _ for a space, a plain one standing in', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('"Nadpis tabulky" {font=Times_New_Roman}'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' });
    expect(html).toContain('style="font-family: &quot;Times New Roman&quot;, &quot;Calibri&quot;, &quot;Arial&quot;, sans-serif"');
    expect(evaluateSheet('"Text" {font=Times_New_Roman}').diagnostics).toEqual([]);
  });
});

describe('a minus before a fraction', () => {
  it('stands before it, as in the books (−ρ·g/E), not in its numerator', async () => {
    const { renderBlockHtml } = await import('../src/index.js');
    const cs = catalogFor('cs');
    const doc = buildPrintDocument(evaluateSheet('ρ := 1000 kg/m³\ng := 9.81 m/s²\nE := 210 GPa\nk := -ρ·g/E'), { catalog: cs, registry: defaultRegistry, digits: 3, title: 'M' });
    expect(renderBlockHtml(doc.blocks.at(-1)!, cs)).toContain('<mo>−</mo><mfrac><mrow><mi>ρ</mi><mo>·</mo><mi>g</mi></mrow><mi>E</mi></mfrac>');
  });
});

describe('more of the style of text', () => {
  it('aligns and colors a line; italic and bold words inside it', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('"Volíme *nejbližší vyšší* průměr, tedy **6 mm**; 2 * 3 zůstane." {align=center color=blue}'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' });
    expect(html).toContain('style="text-align: center; color: #1a4f9c"');
    expect(html).toContain('Volíme <em>nejbližší vyšší</em> průměr, tedy <strong>6 mm</strong>; 2 * 3 zůstane.');
    expect(textHtml('*σ_k* je mez')).toContain('<em><math');
  });
});

describe('style of a heading', () => {
  it('takes its attributes off its text', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('# Výpočet\n## Zadání {color=blue align=center}'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'Výpočet' });
    expect(html).toContain('<h3 style="text-align: center; color: #1a4f9c">Zadání</h3>');
  });
});

describe('calculating on with the rounded value', () => {
  it('gives the rows below the value as shown when the line asks for it, the exact one otherwise', () => {
    const k = (source: string) => evaluateSheet(source).statements.at(-1)!.display!.value;
    expect(k('S := 23.5294 mm² {decimals=2 rounded}\nk := S/(1 mm²)')).toBe(23.53);
    expect(k('S := 23.5294 mm² {decimals=2}\nk := S/(1 mm²)')).toBeCloseTo(23.5294, 10);
    // Two shown values add up to the shown sum.
    expect(k('a := 1.004 {decimals=2 rounded}\nb := 1.004 {decimals=2 rounded}\nc := a + b')).toBeCloseTo(2, 12);
  });
});

describe('format of a solve line', () => {
  it('shows the unknown found with its decimals, below too, and goes on with it rounded when asked', () => {
    const sheet = evaluateSheet('S := 23.53 mm²\nsolve d: S ≤ π·d²/4 {decimals=2 rounded}\nk := d/(1 mm)');
    expect(sheet.diagnostics).toEqual([]);
    expect(sheet.statements.at(-1)!.display!.value).toBeCloseTo(5.47, 12);
    const shown = buildPrintDocument(sheet, { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'S' })
      .blocks.flatMap((b) => (b.kind === 'equation' ? b.lines : []))
      .map((l) => toText(l.rhs).replace(/\s+/g, ' '));
    expect(shown).toContain('5,47 mm');
    expect(shown).toContain('(5,47 mm)/(1 mm)');
  });
});

describe('equation numbers', () => {
  const doc = (source: string, equations: 'none' | 'formulas' | 'results') =>
    buildPrintDocument(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'E', equations });
  const SHEET = 'a := 2 m\nb := 3 m\nc := a + b {eq=soucet}\n"Podle (#soucet) a (#jiny)."\nd := c·2\ne := c·3 {noeq}\nf := 4 m {eq}';

  it('number the formulas in order, skip what the line says, keep plain inputs out', () => {
    const numbers = doc(SHEET, 'formulas').blocks.flatMap((b) => (b.kind === 'equation' ? [b.number ?? null] : []));
    expect(numbers).toEqual([null, null, 1, 2, null, 3]);
    expect(doc(SHEET, 'none').blocks.flatMap((b) => (b.kind === 'equation' ? [b.number ?? null] : []))).toEqual([null, null, 1, null, null, 2]);
  });

  it('put the number of a named equation into text, and its number at the right of the printout', async () => {
    const paragraph = doc(SHEET, 'formulas').blocks.find((b) => b.kind === 'paragraph');
    expect(paragraph?.kind === 'paragraph' && paragraph.text).toBe('Podle (1) a (#jiny).');
    const { printHtml } = await import('../src/index.js');
    expect(printHtml(evaluateSheet(SHEET), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'E', equations: 'formulas' })).toContain('<span class="eq-number">(2)</span></div>');
  });
});

describe('the book style', () => {
  it('centres the formulas and numbers them at the right', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('a := 2 m\nc := a·3'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'B', style: 'book', equations: 'formulas' });
    expect(html).toContain('class="block equation book numbered"');
    expect(html).toContain('<span class="eq-number">(1)</span>');
    expect(html).toContain('.block.equation.book table.eq { margin-left: auto; margin-right: auto; }');
  });
});

describe('the result of a check', () => {
  it('says it in the form the sheet chose, in the check and in the summary', async () => {
    const { printHtml } = await import('../src/index.js');
    const sheet = evaluateSheet('σ := 150 MPa\ncheck "Ohyb": σ ≤ 235 MPa\ncheck "Tah": σ ≤ 100 MPa');
    const html = (verdict?: 'present' | 'future' | 'sign') => printHtml(sheet, { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'V', ...(verdict ? { verdict } : {}) });
    expect(html()).toContain('✓ VYHOVUJE');
    expect(html('future')).toContain('✓ VYHOVÍ');
    expect(html('future')).toContain('✗ NEVYHOVÍ');
    expect(html('future')).not.toContain('VYHOVUJE');
    expect(html('sign')).not.toMatch(/VYHOV/);
  });
});

describe('the head of a page', () => {
  it('has the title on the left and the author with the date on the right', async () => {
    const { printHtml } = await import('../src/index.js');
    const html = printHtml(evaluateSheet('a := 1'), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'Nosník', headRight: 'Jan Novák · 10. 10. 2026' });
    expect(html).toContain('@top-left { content: "Nosník";');
    expect(html).toContain('@top-right { content: "Jan Novák · 10. 10. 2026";');
    expect(html).toContain('counter(page)');
  });
});

describe('a rounded result', () => {
  it('is set after ≐ in the sheet and in the sources', async () => {
    const { kalkLines } = await import('../src/index.js');
    const lines = buildPrintDocument(evaluateSheet('S := 23.53 mm²\nd := sqrt(4·S/π) ≐ 5.5 mm'), { catalog: catalogFor('cs'), registry: defaultRegistry, digits: 4, title: 'R' })
      .blocks.flatMap((b) => (b.kind === 'equation' ? b.lines : []));
    expect(lines.some((l) => l.op === '≐')).toBe(true);
    expect(kalkLines(['derive d := √(4·S_min/π) == 5.47 ≐ 5.5 mm'])[0]!.html).toContain('<mo>≐</mo>');
  });
});

describe('a quadratic solved under conditions', () => {
  it('is worked out as on paper: the discriminant, the roots with the numbers put in, the one set aside', async () => {
    const { printHtml } = await import('../src/index.js');
    const text = (source: string) =>
      printHtml(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'S' })
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\s ]+/g, ' ');
    const kept = text('a := 5\nb := 4\nc := -10\nsolve x ∈ ℝ, x > 0: a·x^2 + b·x + c == 0');
    expect(kept).toContain('x ∈ ℝ , x &gt; 0');
    expect(kept).toContain('D = b 2 − 4 · a · c = 4 2 − 4 · 5 · ( −10 ) = 216');
    expect(kept).toContain('x 2 = −1,87 — nevyhovuje podmínce x &gt; 0 ⇒ x = 1,07');
    expect(text('a := 5\nb := 4\nc := 10\nsolve x ∈ ℝ: a·x^2 + b·x + c == 0')).toContain('D &lt; 0: rovnice nemá v ℝ řešení');
    // A general function of the sheet, written out and then with the numbers put in.
    const general = text('a := 5\nb := 4\nc := -10\ny(x) := a·x^2 + b·x + c\nsolve x ∈ ℝ, x > 0: y(x) == 0');
    expect(general).toContain('y ( x ) = 0 x ∈ ℝ , x &gt; 0 a · x 2 + b · x + c = 0 5 · x 2 + 4 · x − 10 = 0 D =');
  });
});
