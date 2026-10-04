import { describe, expect, it } from 'vitest';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor } from '@kalketa/i18n';
import { printHtml } from '@kalketa/render';
import { aiProtocol } from '../src/logic/aiProtocol.js';

const cs = catalogFor('cs');
const accepted = { id: 'c1:1:1', kind: 'change' as const, time: '2026-10-04T09:06:17Z', model: 'qwen', from: 2, to: 2, before: ['w := L / 200'], after: ['w := L / 300 | mm'], state: 'accepted' as const, decided: '2026-10-04T09:06:25Z' };

describe('the AI notes printed as a protocol', () => {
  it('lists the sources and every proposed change with its decision', () => {
    const text = aiProtocol(cs, {
      sources: [{ kind: 'sheet', title: '', sections: [{ id: 'T1', title: 'Klopení', checked: 2, unsupported: 0 }] }],
      entries: [accepted, { ...accepted, id: 'c1:1:2', state: 'rejected', after: [] }, { ...accepted, id: 'c1:1:3', reviewed: '2026-10-04T10:00:00Z' }],
    });
    expect(text).toContain('## Zdroje a citace');
    expect(text).toContain('- T1 Klopení (ověřeno 2×)');
    expect(text).toContain('## Návrhy změn');
    expect(text).toContain('qwen · řádek 2:** Přijato');
    expect(text).toContain('neprověřeno');
    expect(text).toContain('  - původně: `w := L / 200`');
    expect(text).toContain('  - nově: `w := L / 300 | mm`');
    expect(text).toContain('Odmítnuto');
    expect(text).toContain('řádky se smažou');
    expect(text).toMatch(/prověřeno \d/);
  });

  it('says so when the AI proposed nothing', () => {
    expect(aiProtocol(cs, { sources: [], entries: [] })).toContain('AI nenavrhla žádné změny výpočtu.');
  });
});

describe('a printout with lines the AI made', () => {
  const sheet = ['L := 5 m', 'w := L / 300', 'w_lim := L / 250'].join('\n');
  const settings = { catalog: cs, registry: defaultRegistry, title: 'N1' };

  it('marks them in the margin and warns at the top', () => {
    const html = printHtml(evaluateSheet(sheet), { ...settings, aiLines: new Set([2]) });
    expect(html).toContain('class="ai-notice"');
    expect(html).toContain('zatím je nikdo neprověřil.');
    expect(html.match(/class="ai-made"/g)?.length).toBe(1);
  });

  it('prints as before without them', () => {
    const html = printHtml(evaluateSheet(sheet), settings);
    expect(html).not.toContain('class="ai-notice"');
    expect(html).not.toContain('class="ai-made"');
  });
});
