import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { buildPrintDocument, renderBlockHtml } from '../src/index.js';

const charts = (source: string) => {
  const catalog = catalogFor('en');
  const doc = buildPrintDocument(evaluateSheet(source), { catalog, registry: defaultRegistry, digits: 4, title: '' });
  return doc.blocks.filter((b) => b.kind === 'chart').map((b) => ({ label: 'label' in b ? b.label : undefined, html: renderBlockHtml(b, catalog) }));
};

describe('the text of a chart', () => {
  it('stands under the chart as a numbered caption', () => {
    const [chart] = charts('plot(sin(x), x: 0 .. 6, title: "Sine")');
    expect(chart!.label).toBe('Fig. 1');
    expect(chart!.html).toContain('<figcaption data-part="title">');
  });

  it('over the chart is a heading, with no caption and no number of its own', () => {
    const [first, second] = charts('plot(sin(x), x: 0 .. 6, title: "Sine", style: "title.place=top")\nplot(cos(x), x: 0 .. 6, title: "Cosine")');
    expect(first!.html).not.toContain('<figcaption');
    expect(first!.html).toMatch(/data-part="title"[^>]*>Sine</);
    expect(second!.label).toBe('Fig. 1');
  });
});
