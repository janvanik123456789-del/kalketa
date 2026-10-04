import { describe, expect, it } from 'vitest';
import { kalkFormula, notesHtml } from '../src/index.js';

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
    expect(html).toContain('<div class="kalk"><div class="kalk-formula"');
    expect(html).toContain('<pre class="code"><code>w := 1</code></pre>');
  });
});
