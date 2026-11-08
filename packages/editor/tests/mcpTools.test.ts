import { describe, expect, it } from 'vitest';
import { evaluateSheet, traceName } from '@kalketa/core';
import { MCP_RULES, runMcpTool, type McpEnvironment } from '../src/logic/mcpTools.js';

const result = evaluateSheet('q := 12 kN/m\nL := 5 m\nM := q·L²/8 | kN·m');
const env: McpEnvironment = {
  tabs: [
    { title: 'Nosník', saved: true, active: true },
    { title: 'Deska', saved: false, active: false },
  ],
  sheet: () => 'The sheet "Nosník"',
  trace: (name) => traceName(result, name),
  theory: (query) => `theory for ${query}`,
  guide: () => 'guide',
  catalog: () => 'catalog',
  formula: (id) => (id === 'f' ? 'formula f' : undefined),
  sample: () => undefined,
  propose: (blocks, note, replaces, client) => ({ ok: true, text: `${client}|${note}|${replaces.join(',')}|${blocks}` }),
  status: (ids, client) => ({ ok: true, text: `${client}:${ids.join(',')}` }),
  proposeSheet: (title, lines, client) => ({ ok: true, text: `${client}:${title}:${lines.length}` }),
  pythonCheck: async (code, note, client) => ({ ok: true, text: `${client}|${note}|${code}` }),
  withdraw: (ids, client) => ({ ok: true, text: `${client}:${ids.join(',') || 'all'}` }),
};
const run = async (tool: string, args: Record<string, unknown>) => runMcpTool(tool, args, env);

describe('the tools of the MCP server', () => {
  it('list the open sheets, the active one marked', async () => {
    expect(await run('tabs_list', {})).toEqual({ ok: true, text: '1. Nosník (active)\n2. Deska – unsaved changes' });
  });

  it('give the sheet with the rules of working with it first: the client may not pass the instructions on', async () => {
    const answer = await run('sheet_get', {});
    expect(answer.text.startsWith(MCP_RULES)).toBe(true);
    expect(answer.text).toContain('háčky');
    expect(answer.text).toContain('python_check');
    expect(answer.text.endsWith('The sheet "Nosník"')).toBe(true);
  });

  it('trace a value to its formula and inputs, with line numbers', async () => {
    const answer = await run('sheet_trace', { name: 'M' });
    expect(answer.ok).toBe(true);
    expect(answer.text.split('\n')).toEqual(['M = 37.5 kN·m   ← q·L²/8   (line 3)', '├── q = 12 kN/m   (line 1)', '└── L = 5 m   (line 2)']);
    expect(await run('sheet_trace', { name: 'nic' })).toMatchObject({ ok: false });
  });

  it('say what is not there, and pass the question to the theory', async () => {
    expect(await run('formula_get', { id: 'x' })).toMatchObject({ ok: false });
    expect(await run('formula_get', { id: 'f' })).toEqual({ ok: true, text: 'formula f' });
    expect(await run('theory_get', { query: ' ohyb ' })).toEqual({ ok: true, text: 'theory for ohyb' });
    expect(await run('rm_rf', {})).toMatchObject({ ok: false });
  });

  it('turn proposed changes into the change blocks the chat writes, and refuse a change that says neither where nor what', async () => {
    const answer = await run('propose_change', { changes: [{ replace: '12-14', lines: ['a := 1', 'b := 2'] }, { after: 20, lines: ['c := a + b'] }, { replace: '30', lines: [] }], note: 'Oprava', replaces: ['x:1:1', 7], _client: 'claude-code' });
    expect(answer.text).toBe('claude-code|Oprava|x:1:1|```change 12-14\na := 1\nb := 2\n```\n\n```change after 20\nc := a + b\n```\n\n```change 30\n```');
    expect(await run('propose_change', { changes: [{ lines: ['a := 1'] }] })).toMatchObject({ ok: false });
    expect(await run('propose_change', { changes: [{ replace: '12', after: 3, lines: [] }] })).toMatchObject({ ok: false });
    expect((await run('propose_new_sheet', { title: 'Nový', lines: ['# Nový'], _client: 'c' })).text).toBe('c:Nový:1');
  });

  it('run a check in Python and withdraw proposals, under the client', async () => {
    expect((await run('python_check', { code: 'result("tau", 1.034, "s")', note: 'τ', _client: 'strata' })).text).toBe('strata|τ|result("tau", 1.034, "s")');
    expect(await run('python_check', { code: '  ' })).toMatchObject({ ok: false });
    expect((await run('withdraw_proposals', { _client: 'strata' })).text).toBe('strata:all');
    expect((await run('withdraw_proposals', { ids: ['a:1:1'], _client: 'strata' })).text).toBe('strata:a:1:1');
  });
});
