import { describe, expect, it } from 'vitest';
import { kalkFormula, kalkLines, notesHtml } from '../src/index.js';

describe('formulas in the sources', () => {
  it('are typeset from the calculation language, nothing computed', () => {
    const w = kalkFormula('w := 5·q·L^4/(384·E·I)');
    expect(w.ok).toBe(true);
    expect(w.html).toContain('<math');
    expect(w.html).toContain('<mfrac>');
    expect(w.html).toContain('384');
    expect(kalkFormula('A(d) := π·d^2/4').html).toContain('<mo>(</mo>');
    expect(kalkFormula('check "Ohyb": σ ≤ f_y').html).toContain('Ohyb:');
  });

  it('mark a line the language does not read', () => {
    expect(kalkFormula('w := 5 ·· (')).toEqual({ html: '<code class="kalk-bad">w := 5 ·· (</code>', ok: false });
  });

  it('come as a ```kalk block; other code stays as written', () => {
    const html = notesHtml(['Průhyb:', '', '```kalk', 'w := 5·q·L^4/(384·E·I)', '```', '', '```', 'w := 1', '```'].join('\n'));
    // A formula with no note of the AI on it stands as printed: centred.
    expect(html).toContain('<div class="kalk confirmed"><div class="kalk-formula"');
    expect(html).toContain('<pre class="code"><code>w := 1</code></pre>');
  });
});

describe('a line of the book with ⇒ and a bound followed by a chain', () => {
  it('typesets the parts joined by ⇒ and checks the chain of the bound', () => {
    const [line] = kalkLines(['S_min <= π·d^2/4 ⇒ d >= sqrt(4·S_min/π) == sqrt(4·23.53/π) ≈ 5.5 mm']);
    expect(line!.html).not.toContain('kalk-bad');
    expect(line!.html).toContain('⇒');
    expect(line!.html).toContain('≐');
    expect(line!.check?.ok).toBe(true);
    // A wrong number at the end shows, numbered through the line.
    expect(kalkLines(['S_min <= π·d^2/4 ⇒ d >= sqrt(4·S_min/π) == sqrt(4·23.53/π) ≈ 7.5 mm'])[0]!.check?.ok).toBe(false);
  });
});
