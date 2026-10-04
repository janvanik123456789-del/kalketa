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
