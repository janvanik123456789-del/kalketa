import { describe, expect, it } from 'vitest';
import { briefing, checksNeedAnswer, isRoundResult, parsePythonChecks, pythonReport, type CheckReport, type CheckWords } from '../src/index.js';

const FENCE = '`'.repeat(3);
const WORDS: CheckWords = {
  title: 'Ověření v Pythonu',
  quantity: 'Veličina',
  difference: 'Rozdíl',
  states: { agree: 'souhlasí', differ: 'liší se', missing: 'list ji nemá', units: 'jednotky', unit: 'neznámá jednotka' },
  failed: 'Skript skončil chybou',
  declined: 'Nepovoleno.',
  none: 'Žádný výsledek.',
  output: 'Výstup',
  ask: 'Oprav to.',
  timeout: 'Zrychli to.',
  missing: 'Výpočet v listu ještě není.',
  capped: 'Kulaté číslo: smyčka skončila stropem.',
};
const format = (n: number) => n.toFixed(2).replace('.', ',');

describe('checks in Python written by the model', () => {
  it('are the python blocks of an answer, not other code', () => {
    const answer = `Ověřím to:\n\n${FENCE}python\nresult("v", 2, "m/s")\n${FENCE}\n\n${FENCE}change 3\nv := 2 m/s\n${FENCE}\n\n${FENCE}python\n\n${FENCE}\n${FENCE}python\nprint(1)\n${FENCE}`;
    expect(parsePythonChecks(answer)).toEqual(['result("v", 2, "m/s")', 'print(1)']);
  });

  it('come back as a table the user reads and the model answers when something disagrees', () => {
    const agreed: CheckReport = { ok: true, output: '', rows: [{ name: 'v_A', kalketa: '13,2883 m/s', python: '13,2883 m/s', difference: 0, state: 'agree' }] };
    const wrong: CheckReport = { ok: true, output: 'kontrola', rows: [{ name: 'F', kalketa: '2 kN', python: '4 kN', difference: 0.5, state: 'differ' }] };
    expect(checksNeedAnswer([agreed])).toBe(false);
    expect(checksNeedAnswer([agreed, wrong])).toBe(true);
    // A failed script, or one that reported nothing, needs the model too; one the user did not let run does not.
    expect(checksNeedAnswer([{ ok: false, error: 'NameError', output: '', rows: [] }])).toBe(true);
    expect(checksNeedAnswer([{ ok: true, output: '', rows: [] }])).toBe(true);
    expect(checksNeedAnswer([{ ok: false, output: '', rows: [], declined: true }])).toBe(false);
    const text = pythonReport([wrong], WORDS, format);
    expect(text).toContain('| F | 2 kN | 4 kN | 50,00 % | ✗ liší se |');
    expect(text).toContain(`${FENCE}text\nkontrola\n${FENCE}`);
    expect(text.endsWith('Oprav to.')).toBe(true);
    expect(pythonReport([agreed], WORDS, format)).not.toContain('Oprav to.');
    // Results the sheet has no value for: the calculation is not in the sheet yet, which is no disagreement.
    const absent: CheckReport = { ok: true, output: '', rows: [{ name: 't_v', python: '52,6 min', state: 'missing' }] };
    expect(pythonReport([agreed, absent], WORDS, format)).toContain('Výpočet v listu ještě není.');
    expect(pythonReport([agreed, absent], WORDS, format)).not.toContain('Oprav to.');
    expect(pythonReport([absent, wrong], WORDS, format)).toContain('Oprav to.');
    // A round number that disagrees: the loop ran into its cap.
    expect(isRoundResult(10000)).toBe(true);
    expect(isRoundResult(9000)).toBe(true);
    expect(isRoundResult(3158.9)).toBe(false);
    expect(isRoundResult(50)).toBe(false);
    const capped: CheckReport = { ok: true, output: '', rows: [{ name: 't_v', kalketa: '3 158,9 s', python: '10 000 s', difference: 0.68, state: 'differ', round: true }] };
    expect(pythonReport([capped], WORDS, format)).toContain('Kulaté číslo: smyčka skončila stropem.');
    expect(pythonReport([wrong], WORDS, format)).not.toContain('Kulaté číslo');
  });

  it('are explained to the model only when the program can run them', () => {
    const sheet = { title: 'T', source: 'x := 1' };
    expect(briefing({ language: 'cs', sheet })).not.toContain('check a calculation independently in Python');
    const told = briefing({ language: 'cs', sheet, python: { numpy: true } });
    expect(told).toContain('check a calculation independently in Python');
    expect(told).toContain('and NumPy');
    expect(briefing({ language: 'cs', sheet, python: { numpy: false } })).not.toContain('NumPy');
  });
});
