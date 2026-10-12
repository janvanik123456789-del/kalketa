import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet, formatPlacement, parsePlacement } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml, type PrintBlock } from '../src/index.js';

const cs = catalogFor('cs');
const chart = (source: string): Extract<PrintBlock, { kind: 'chart' }> => {
  const doc = buildPrintDocument(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
  const block = doc.blocks.at(-1)!;
  if (block.kind !== 'chart') throw new Error(`not a chart: ${JSON.stringify(block)}`);
  return block;
};
const BEAM = 'q := 12 kN/m\nL := 5 m\nM(x) := q·x·(L - x)/2\nV(x) := q·(L/2 - x)\n';

describe('charts in print', () => {
  it('draw a curve with its axes named after the variable, the expression and the units', () => {
    const block = chart(`${BEAM}plot(M(x), x: 0 m .. L)`);
    expect(block.spec.xTitle).toBe('x [m]');
    expect(block.spec.yTitle).toBe('M(x) [kN·m]');
    expect(block.svg).toMatch(/^<svg class="chart-svg"/);
    expect(block.svg).toContain('x [m]');
    // Ticks with a decimal comma, the top of the moment axis is round.
    expect(block.layout.y.ticks).toContain(40);
    expect(block.label).toBeUndefined();
    expect(renderBlockHtml(block, cs)).toContain('<figure class="block chart" data-line="5">');
  });

  it('number a chart with a title as a figure, after pictures', () => {
    const block = chart(`![Schéma](images/a.png)\n${BEAM}plot(M(x), V(x)·1 m, x: 0 m .. L, title: "Vnitřní síly")`);
    expect(block.label).toBe('Obr. 2');
    expect(renderBlockHtml(block, cs)).toContain('Obr. 2:</span> Vnitřní síly');
    // Two curves: a legend and the unit alone on the y axis.
    expect(block.spec.yTitle).toBe('[kN·m]');
    expect(block.spec.series.map((s) => s.label.replace(/\s/g, ' '))).toEqual(['M(x)', 'V(x)·1 m']);
  });

  it('write dates under an x axis of dates', () => {
    const block = chart('d := [2026-01-01, 2026-03-01]\nE := [5, 7] kWh\nplot(E, x: d, kind: "bar")');
    expect(block.svg).toContain('1. 1. 2026');
    expect(block.spec.kind).toBe('bar');
  });

  it('show a wrong chart as an error line', () => {
    const doc = buildPrintDocument(evaluateSheet(`${BEAM}plot(M(x), V(x), x: 0 m .. L)`), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    expect(doc.blocks.at(-1)!.kind).toBe('error');
  });
});

describe('a series of dates in print', () => {
  it('writes every date out, with no unit after the brackets', () => {
    const doc = buildPrintDocument(evaluateSheet('d := [2026-01-01, 2026-02-01]\nd ='), { catalog: cs, registry: defaultRegistry, digits: 4, title: 'T' });
    const html = renderBlockHtml(doc.blocks.at(-1)!, cs);
    expect(html).toContain('1. 1. 2026');
    expect(html).not.toContain('date');
  });

  it('place a chart as a picture: flowed around, moved from its line and its edge', () => {
    const block = chart(`${BEAM}plot(M(x), x: 0 m .. L, place: "width=40% wrap=right dx=6% dy=8mm")`);
    expect([block.width, block.wrap, block.dx, block.dy]).toEqual([40, 'right', 6, 8]);
    const html = renderBlockHtml(block, cs);
    expect(html).toContain('<div class="wrap-stop wrap-right" style="height:8mm"></div><figure class="block chart wrap-right"');
    expect(html).toContain('style="width:40%;margin-right:6%;clear:right"');
    const bad = evaluateSheet(`${BEAM}plot(M(x), x: 0 m .. L, place: "side=right")`);
    expect(bad.diagnostics.map((d) => d.code)).toContain('E-PLOT-POSITION');
  });
});

describe('the height of a chart to its width', () => {
  it('follows ratio=… of its place, set by dragging its edge', () => {
    const block = (place: string) => buildPrintDocument(evaluateSheet(`plot(x^2, x: 0 .. 4${place})`), { catalog: catalogFor('cs'), registry: defaultRegistry, title: 'T', digits: 4 }).blocks.find((b) => b.kind === 'chart')!;
    const usual = block('');
    const tall = block(', place: "width=60% ratio=0.8"');
    expect(usual.kind === 'chart' && usual.layout.height).toBe(300);
    expect(tall.kind === 'chart' && tall.layout.height).toBe(512);
    expect(parsePlacement('width=60% ratio=0.8')).toEqual({ ratio: 0.8, width: 60 });
    expect(formatPlacement({ width: 60, ratio: 0.8 })).toBe('width=60% ratio=0.8');
  });
});
