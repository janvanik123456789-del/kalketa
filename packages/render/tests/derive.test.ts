import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { printHtml } from '../src/index.js';

const cs = catalogFor('cs');
const html = (source: string, style: 'compact' | 'airy' = 'compact') => printHtml(evaluateSheet(source), { catalog: cs, registry: defaultRegistry, title: 'T', style });

describe('derivations in print', () => {
  it('set a derivation as a chain of equal forms, then the substitution and the result, marked as checked', () => {
    const out = html('q := 12 kN/m\nL := 5 m\nW := 194.3 cm^3\nσ := q·L²/(8·W) == q·L^2/8/W | MPa');
    const sigma = out.slice(out.indexOf('data-line="4"'));
    const block = sigma.slice(0, sigma.indexOf('</section>'));
    expect(block.match(/class="part (formula|substitution|result)"/g)).toEqual(['class="part formula"', 'class="part formula"', 'class="part substitution"', 'class="part result"']);
    expect(block).toContain('<div class="derived">✓ odvození ověřeno</div>');
  });

  it('mark a wrong step with its message and without the check mark', () => {
    const out = html('derive F·l^3/(3·E·I) == F·l^3/(2·E·I)');
    expect(out).toContain('Odvození: krok 1 neplatí');
    expect(out).not.toContain('class="derived"');
  });

  it('set Σ and ∫ without bounds as in a textbook', () => {
    const out = html('derive E·integral(y^2, dS) == integral(y^2, dS)·E\nderive sum(F_i·a_i, i) == sum(a_i·F_i, i)', 'airy');
    expect(out).toContain('<mo>∫</mo>');
    expect(out).toMatch(/<mi mathvariant="normal">d<\/mi><mi>S<\/mi>/);
    expect(out).toMatch(/<munderover><mo>∑<\/mo><mi>i<\/mi>/);
  });
});
