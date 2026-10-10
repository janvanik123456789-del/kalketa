import { describe, expect, it } from 'vitest';
import { notesHtml } from '../src/index.js';

describe('notes Markdown, as models write it', () => {
  it('shows `code` as written, without marks inside it', () => {
    expect(notesHtml('Hodnota `w = 23 mm` a `**ne**`, **tučně**.')).toBe('<p>Hodnota <code>w = 23 mm</code> a <code>**ne**</code>, <strong>tučně</strong>.</p>');
  });

  it('keeps a code block as written, escaped', () => {
    const fence = '`'.repeat(3);
    expect(notesHtml(`${fence}text\n8 | profil := pick(Profily_IPE, "IPE 220")\n<b>x</b>\n${fence}`)).toBe(
      '<pre class="code"><code>8 | profil := pick(Profily_IPE, &quot;IPE 220&quot;)\n&lt;b&gt;x&lt;/b&gt;</code></pre>',
    );
  });

  it('indents a second level of bullets', () => {
    expect(notesHtml('- IPE 200\n  - ř. 13\n- IPE 220')).toBe('<ul><li>IPE 200</li><li class="sub">ř. 13</li><li>IPE 220</li></ul>');
  });

  it('draws a table with aligned columns and a dividing line, escaped', () => {
    const text = ['---', '| Profil | G |', '|---|---:|', '| IPE 200 | **22.4** |', '| <b>x</b> | 1 |', 'Za tabulkou.'].join('\n');
    expect(notesHtml(text)).toBe(
      '<hr>\n<table class="md"><thead><tr><th>Profil</th><th style="text-align:right">G</th></tr></thead><tbody>' +
        '<tr><td>IPE 200</td><td style="text-align:right"><strong>22.4</strong></td></tr>' +
        '<tr><td>&lt;b&gt;x&lt;/b&gt;</td><td style="text-align:right">1</td></tr></tbody></table>\n<p>Za tabulkou.</p>',
    );
  });

  it('leaves a row of pipes without a rule under it as text', () => {
    expect(notesHtml('| a | b |')).toBe('<p>| a | b |</p>');
  });

  it('shows the id of a theory section as a badge', () => {
    expect(notesHtml('## Klopení {#T3}')).toBe('<h3>Klopení <span class="tid">T3</span></h3>');
  });
});

describe('formulas of the sources checked as derivations', () => {
  it('typeset the whole chain, check its steps with the symbols the block introduces, and mark a wrong one', async () => {
    const { kalkLines } = await import('../src/index.js');
    const { catalogFor } = await import('@kalketa/i18n');
    const lines = kalkLines(
      ["' AI z obrázku", 'derive M_mp := l^3·F/3', 'derive y := M_mp/(E·I) == (l^3·F)/(3·E·I) == F·l^3/(3·E·I)', 'derive w := q·L^4/(8·E·I) == q·L^3/(8·E·I)'],
      catalogFor('cs'),
    );
    expect(lines[0]).toMatchObject({ note: 'AI z obrázku' });
    expect(lines[1]!.check).toBeUndefined();
    expect(lines[2]!.check).toEqual({ ok: true, text: '✓ odvození ověřeno' });
    expect(lines[2]!.html.match(/<mo>=<\/mo>/g)).toHaveLength(3);
    expect(lines[3]!.check?.ok).toBe(false);
    expect(lines[3]!.check?.text).toContain('krok 1 nesouhlasí');
  });
});

describe('a worked example of the book in the sources', () => {
  it('reads decimal commas, takes the values put in, checks the numbers and finds a wrong result', async () => {
    const { kalkLines } = await import('../src/index.js');
    const { catalogFor } = await import('@kalketa/i18n');
    const cs = catalogFor('cs');
    const check = (block: string[]) => kalkLines(block, cs).at(-1)!.check?.text ?? '';
    const tau = 'derive τ_Dov_s := τ_Ks·K_I / n == 0,6·σ_Kt·K_I / n == 0,6·170·1 / 1,5 == 68 MPa';
    // A relation of the theory put in (τ_Ks = 0,6·σ_Kt) is not known to the check, until it is written above.
    expect(check([tau])).toContain('krok 1 nesouhlasí');
    expect(check(['derive τ_Ks := 0,6·σ_Kt', tau])).toBe('✓ odvození ověřeno, dosazené hodnoty dávají výsledek');
    expect(check(['derive S_min := F/τ_Dov_s == 1600/68 == 23,53 mm²'])).toContain('✓');
    expect(check(['derive S_min := F/τ_Dov_s == 1600/68 == 25 mm²'])).toContain('krok 2 nesouhlasí');
    // The numbers as the language of the user writes them.
    expect(kalkLines([tau], cs)[0]!.html).toContain('<mn>0,6</mn>');
  });
});
