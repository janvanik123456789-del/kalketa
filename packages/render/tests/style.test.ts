import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, pageLabels, printHtml, sheetSections } from '../src/index.js';

const cs = catalogFor('cs');
const sheet = ['L := 5 m', 'q := 12 kN/m', 'M := q·L^2/8', 'check "Ohyb": M ≤ 50 kN·m'].join('\n');
const html = (style?: 'compact' | 'airy') => printHtml(evaluateSheet(sheet), { catalog: cs, registry: defaultRegistry, title: 'N1', ...(style ? { style } : {}) });

describe('calculation styles', () => {
  it('compact: formula, substitution and result on one line, inputs side by side, a check on one line', () => {
    const out = html('compact');
    expect(out).toContain('<div class="flow-group"><section class="block equation compact"');
    // The flow group holds the two inputs; the formula of M is a flow of its own with three parts.
    expect(out.match(/<div class="flow-group">/g)).toHaveLength(1);
    const m = out.slice(out.indexOf('data-line="3"'));
    expect(m.slice(0, m.indexOf('</section>')).match(/class="part (formula|substitution|result)"/g)).toEqual(['class="part formula"', 'class="part substitution"', 'class="part result"']);
    expect(out).toContain('<section class="block check compact passed"');
    expect(out).not.toContain('<table class="eq">');
  });

  it('airy is the step-per-line setting, and what a file without a style gets', () => {
    expect(html('airy')).toContain('<table class="eq">');
    expect(html('airy')).not.toContain('<div class="flow-group">');
    expect(html()).toBe(html('airy'));
  });
});

describe('the style with columns (a British calculation sheet)', () => {
  it('puts the source on the left, the working in the middle, the result and the verdict on the right', () => {
    const source = 'q := 12 kN/m\nL := 6 m\nM_Ed := q·L²/8 | kN·m  source "EN 1990, 6.10"\ncheck "Ohyb": M_Ed ≤ 60 kN·m  source "EN 1993-1-1, 6.2.5"';
    const html = printHtml(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'T', style: 'columns' });
    expect(html).toContain('<div class="cols cols-head"><div class="col-ref">Odkaz</div><div class="col-calc">Výpočet</div><div class="col-out">Výsledek</div></div>');
    expect(html).toMatch(/<div class="cols"><div class="col-ref">EN 1990, 6\.10<\/div><div class="col-calc">.*<\/div><div class="col-out"><div class="out-line">.*54.*<\/div><\/div><\/div>/s);
    expect(html).toMatch(/<div class="col-ref">EN 1993-1-1, 6\.2\.5<\/div>.*<div class="out-verdict passed">.*VYHOVUJE/s);
    // Another style shows the source of a formula as a check does.
    expect(printHtml(evaluateSheet(source), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'T' })).toContain('<span class="source">[EN 1990, 6.10]</span>');
  });
});

describe('pages numbered by sections', () => {
  it('take positions as sections, else the headings of the highest level that comes twice', () => {
    const blocksOf = (source: string) => buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, title: 'T', digits: 4 }).blocks;
    expect([...sheetSections(blocksOf('# Nosník\n## Zadání\nL := 5 m\n## Výpočet\nM := L·2 kN')).values()]).toEqual([{ label: '1', title: 'Zadání' }, { label: '2', title: 'Výpočet' }]);
    expect([...sheetSections(blocksOf('# Strop\n## Deska {pos}\nA := 1 kN\n## Průvlak {pos=3a}\nF := Pos1.A')).values()]).toEqual([{ label: '1', title: 'Pos. 1 Deska' }, { label: '3a', title: 'Pos. 3a Průvlak' }]);
    expect(pageLabels([undefined, { label: '1', title: '' }, undefined, { label: 'A', title: '' }])).toEqual(['1', '1.1', '1.2', 'A.1']);
  });

  it('give the printout its own pages: the sections marked, its script let in by its nonce only', () => {
    const html = printHtml(evaluateSheet('# Nosník\n## Zadání\nL := 5 m\n## Výpočet\nM := L·2 kN'), { catalog: cs, registry: defaultRegistry, title: 'T', pageNumbers: 'sections' });
    expect(html).toContain('<h3 data-section="1" data-section-title="Zadání">');
    const nonce = /script-src 'nonce-([0-9a-f]{32})'/.exec(html)?.[1];
    expect(nonce).toBeDefined();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(html).not.toContain('counter(pages)');
    // Through, as before: the browser counts the pages.
    expect(printHtml(evaluateSheet('L := 5 m'), { catalog: cs, registry: defaultRegistry, title: 'T' })).toContain('counter(pages)');
  });
});

describe('cells: lines beside each other on one row', () => {
  it('put a line marked {beside} next to the one above it, a text beside a formula', () => {
    const result = evaluateSheet('"Zatěžující síla"\nF := 1600 N {beside}\nn := 1.5');
    expect(result.diagnostics).toEqual([]);
    const html = printHtml(result, { catalog: cs, registry: defaultRegistry, title: 'T' });
    expect(html).toMatch(/<div class="cells"><div class="cell"><p class="text">Zatěžující síla<\/p><\/div><div class="cell"><section class="block equation" data-line="2">/);
    // The line after them stands on a row of its own.
    expect(html.match(/<div class="cells">/g)).toHaveLength(1);
  });
});
