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

  it('set a relation as an equation without a check mark, and a derivation from it as checked from that relation', () => {
    const sheet = 'relation dV - dV_0 == (2·ε_xx + ε_zz)·dV_0 {eq=3}\nderive (dV - dV_0)/dV_0 == 2·ε_xx + ε_zz';
    const numbered = printHtml(evaluateSheet(sheet), { catalog: cs, registry: defaultRegistry, title: 'T', equations: 'formulas' });
    const relation = numbered.slice(numbered.indexOf('data-line="1"'), numbered.indexOf('data-line="2"'));
    expect(relation).not.toContain('class="derived"');
    expect(relation).toContain('<span class="eq-number">(1)</span>');
    expect(numbered).toContain('<div class="derived">✓ odvození ověřeno ze vztahu (1)</div>');
    // Named, it is numbered even when the sheet numbers nothing else; without a name: the relation above.
    expect(html(sheet)).toContain('✓ odvození ověřeno ze vztahu (1)</div>');
    expect(html('relation x^2 + y^2 == r^2\nderive y^2 == r^2 - x^2')).toContain('✓ odvození ověřeno, plyne ze vztahu výše</div>');
  });

  it('print a solve by the name of a relation with the equation of the relation', () => {
    const out = html('relation x^2 + y^2 == r^2 {eq=Kruh}\nx := 3\nr := 5\nsolve y ∈ ℝ, y > 0: Kruh');
    const solve = out.slice(out.indexOf('data-line="4"'));
    expect(solve).not.toContain('Kruh');
    const text = solve.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // No term in y: as on paper, y = ±√(r² − x²), without the discriminant or a vertex of a parabola.
    expect(text).toContain('x 2 + y 2 = r 2 y ∈ ℝ , y &gt; 0 y 1,2 = ± r 2 − x 2 = ± 5 2 − 3 2 y 1 = 4');
    expect(text).not.toContain('D =');
    expect(text).not.toContain('V =');
    expect(html('solve x ∈ ℝ: x^2 + 4 == 0')).toContain('druhá mocnina nemůže být záporná');
    expect(solve).toContain('nevyhovuje podmínce');
  });

  it('leave the check marks out of the printout when they are for the screen only', () => {
    const sheet = evaluateSheet('derive (l^3·F/3)/(E·I) == F·l^3/(3·E·I)');
    const printed = printHtml(sheet, { catalog: cs, registry: defaultRegistry, title: 'T' });
    const screen = printHtml(sheet, { catalog: cs, registry: defaultRegistry, title: 'T', derivations: 'screen' });
    expect(printed).not.toContain('.derived { display: none; }');
    expect(screen).toContain('.derived { display: none; }');
    // Still there for the screen and for whoever reads the page: only not printed.
    expect(screen).toContain('<div class="derived">✓ odvození ověřeno</div>');
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
