import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { printHtml } from '../src/index.js';

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
