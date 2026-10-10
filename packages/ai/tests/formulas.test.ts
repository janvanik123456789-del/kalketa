import { describe, expect, it } from 'vitest';
import { cleanFormula, formulaPrompt } from '@kalketa/ai';
import { askAboutImage } from '@kalketa/ai/connect';

describe('formulas read from pictures', () => {
  it('are asked for in the calculation language', () => {
    expect(formulaPrompt()).toContain('`name := expression`');
    expect(formulaPrompt()).toContain('answer: none');
  });

  it('come without a code block, or not at all', () => {
    const fence = '`'.repeat(3);
    expect(cleanFormula(`${fence}kalk\nM_omax := R_A·a\nR_A·a == R_B·b\n${fence}`)).toEqual(['M_omax := R_A·a', 'R_A·a == R_B·b']);
    expect(cleanFormula('none')).toBeUndefined();
    expect(cleanFormula('  ')).toBeUndefined();
  });

  it('come into the calculation language from LaTeX or a plain equation', () => {
    // As the user's local model wrote the cut-out "y = 5·Q·l³ / (384·E·I)".
    expect(cleanFormula('$$y = \\frac{5 \\cdot Q \\cdot l^{3}}{384 \\cdot E \\cdot I}$$')).toEqual(['y := (5·Q·l^3)/(384·E·I)']);
    // A chain stays one derivation, checked step by step.
    expect(cleanFormula('M_omax = R_A · a = R_B · b.')).toEqual(['derive M_omax := R_A·a == R_B·b']);
    expect(formulaPrompt()).toContain('derive y := a == b == c');
    expect(cleanFormula('\\sigma_{max} = \\frac{M}{W_{y}} \\leq f_{y}')).toEqual(['σ_max = (M)/(W_y) ≤ f_y']);
    expect(cleanFormula('w = \\sqrt{\\frac{a}{b}} (12)')).toEqual(['w := sqrt((a)/(b))']);
    expect(cleanFormula('w := L/250')).toEqual(['w := L/250']);
    // As the user's local model wrote two cut-outs of the textbook.
    expect(cleanFormula('M_o(x) == F·x')).toEqual(['M_o(x) := F·x']);
    expect(cleanFormula('y := M_mp/(E·I) == (l^3·F)/(3·E·I) == F·l^3/(3·E·I)')).toEqual(['derive y := M_mp/(E·I) == (l^3·F)/(3·E·I) == F·l^3/(3·E·I)']);
    expect(cleanFormula('derive y := a/b == a·b^-1')).toEqual(['derive y := a/b == a·b^-1']);
    expect(cleanFormula('derive w := L/250')).toEqual(['derive w := L/250']);
    expect(cleanFormula('a·b = c = d')).toEqual(['derive a·b == c == d']);
  });

  it('go to a local server with the picture, answered at once', async () => {
    let sent: { stream: boolean; messages: { content: { type: string; image_url?: { url: string } }[] }[] } | undefined;
    const fetchFn = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ model: 'qwen', choices: [{ message: { content: 'M := F·a' }, finish_reason: 'stop' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await askAboutImage({ provider: 'server', model: 'qwen', url: 'http://127.0.0.1:8080', prompt: 'P', image: { type: 'image/png', data: 'AAAA' } }, { fetch: fetchFn });
    expect(result).toEqual({ ok: true, text: 'M := F·a', model: 'qwen' });
    expect(sent?.stream).toBe(false);
    expect(sent?.messages[0]?.content[1]?.image_url?.url).toBe('data:image/png;base64,AAAA');
  });
});

describe('figures described for search', () => {
  it('are asked for in the language of the user, and a formula is no figure', async () => {
    const { figurePrompt, cleanFigureDescription, terms } = await import('@kalketa/ai');
    expect(figurePrompt('Czech')).toContain('in Czech');
    expect(cleanFigureDescription('Průběh ohybového momentu prostého nosníku.')).toBe('Průběh ohybového momentu prostého nosníku');
    expect(cleanFigureDescription('Obrázek ukazuje "zkos" {y}')).toBe('zkos y');
    expect(cleanFigureDescription('formula')).toBeUndefined();
    // Written after the picture, the words of the description are words of its section.
    const line = '![Pružnost a pevnost, s. 36](images/obr.png){alt="průběh ohybového momentu"}';
    expect(terms(line)).toEqual(expect.arrayContaining(terms('ohybového momentu')));
  });
});
