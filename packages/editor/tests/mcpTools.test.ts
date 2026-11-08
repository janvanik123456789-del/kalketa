import { describe, expect, it } from 'vitest';
import { evaluateSheet, traceName } from '@kalketa/core';
import { runMcpTool, type McpEnvironment } from '../src/logic/mcpTools.js';

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
};

describe('the tools of the MCP server', () => {
  it('list the open sheets, the active one marked', () => {
    expect(runMcpTool('tabs_list', {}, env)).toEqual({ ok: true, text: '1. Nosník (active)\n2. Deska – unsaved changes' });
  });

  it('trace a value to its formula and inputs, with line numbers', () => {
    const answer = runMcpTool('sheet_trace', { name: 'M' }, env);
    expect(answer.ok).toBe(true);
    expect(answer.text.split('\n')).toEqual(['M = 37.5 kN·m   ← q·L²/8   (line 3)', '├── q = 12 kN/m   (line 1)', '└── L = 5 m   (line 2)']);
    expect(runMcpTool('sheet_trace', { name: 'nic' }, env)).toMatchObject({ ok: false });
  });

  it('say what is not there, and pass the question to the theory', () => {
    expect(runMcpTool('formula_get', { id: 'x' }, env)).toMatchObject({ ok: false });
    expect(runMcpTool('formula_get', { id: 'f' }, env)).toEqual({ ok: true, text: 'formula f' });
    expect(runMcpTool('theory_get', { query: ' ohyb ' }, env)).toEqual({ ok: true, text: 'theory for ohyb' });
    expect(runMcpTool('rm_rf', {}, env)).toMatchObject({ ok: false });
  });

  it('turn proposed changes into the change blocks the chat writes, and refuse a change that says neither where nor what', () => {
    const answer = runMcpTool('propose_change', { changes: [{ replace: '12-14', lines: ['a := 1', 'b := 2'] }, { after: 20, lines: ['c := a + b'] }, { replace: '30', lines: [] }], note: 'Oprava', replaces: ['x:1:1', 7], _client: 'claude-code' }, env);
    expect(answer.text).toBe('claude-code|Oprava|x:1:1|```change 12-14\na := 1\nb := 2\n```\n\n```change after 20\nc := a + b\n```\n\n```change 30\n```');
    expect(runMcpTool('propose_change', { changes: [{ lines: ['a := 1'] }] }, env)).toMatchObject({ ok: false });
    expect(runMcpTool('propose_change', { changes: [{ replace: '12', after: 3, lines: [] }] }, env)).toMatchObject({ ok: false });
    expect(runMcpTool('propose_new_sheet', { title: 'Nový', lines: ['# Nový'], _client: 'c' }, env).text).toBe('c:Nový:1');
  });
});
