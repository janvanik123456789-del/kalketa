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
