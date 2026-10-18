import { describe, expect, it } from 'vitest';
import { briefing, noteText, parseChoices, parseNotes, pythonReport, withoutAnswerBlocks, type CheckWords } from '../src/index.js';

const FENCE = '`'.repeat(3);

describe('blocks of an answer the user acts on', () => {
  it('a choice: its key, its question and its answers as buttons', () => {
    const answer = `Než začnu:\n\n${FENCE}choice detail Jak podrobně má být výpočet?\nbrief: Stručně – vzorec a výsledek\npaper: Jako na papíře\n- teaching: Výukově\n${FENCE}\n\n${FENCE}choice Který profil?\nIPE 200\nIPE 220\n${FENCE}\n${FENCE}choice detail Jen jedna?\nbrief: Stručně\n${FENCE}`;
    expect(parseChoices(answer)).toEqual([
      { key: 'detail', question: 'Jak podrobně má být výpočet?', options: [{ value: 'brief', label: 'Stručně – vzorec a výsledek' }, { value: 'paper', label: 'Jako na papíře' }, { value: 'teaching', label: 'Výukově' }] },
      { question: 'Který profil?', options: [{ value: 'IPE 200', label: 'IPE 200' }, { value: 'IPE 220', label: 'IPE 220' }] },
    ]);
  });

  it('a note for a layer, put in under its title; both kinds of block left out of the text shown', () => {
    const answer = `Navrhuji zápis:\n\n${FENCE}note ai Ověření v Pythonu\nObě hodnoty souhlasí.\n\n- v_A ✓\n${FENCE}\n${FENCE}note sources\nTeorie.\n${FENCE}\n${FENCE}note elsewhere X\nnic\n${FENCE}`;
    const notes = parseNotes(answer);
    expect(notes).toEqual([
      { target: 'ai', title: 'Ověření v Pythonu', text: 'Obě hodnoty souhlasí.\n\n- v_A ✓' },
      { target: 'sources', title: '', text: 'Teorie.' },
    ]);
    expect(noteText(notes[0]!)).toBe('## Ověření v Pythonu\n\nObě hodnoty souhlasí.\n\n- v_A ✓\n');
    const shown = withoutAnswerBlocks(`A\n${FENCE}choice x Q?\na: 1\nb: 2\n${FENCE}\nB\n${FENCE}note ai T\nn\n${FENCE}`, () => '(volba)', () => '(zápis)');
    expect(shown).toBe('A\n(volba)\nB\n(zápis)');
  });
});

describe('the briefing on writing a calculation', () => {
  const sheet = { title: 'T', source: 'x := 1' };
  it('asks for the level of detail by a choice when none is set, and keeps to the one set', () => {
    const asked = briefing({ language: 'cs', sheet });
    expect(asked).toContain(`${FENCE}choice detail`);
    expect(asked).toContain('Level "paper"');
    const paper = briefing({ language: 'cs', sheet: { ...sheet, detail: 'paper' } });
    expect(paper).toContain('chose the level of detail "paper"');
    expect(paper).not.toContain(`${FENCE}choice detail`);
    expect(paper).not.toContain('Level "brief"');
    // Notes for the layers are proposed, never claimed as saved.
    expect(paper).toContain(`${FENCE}note ai`);
    expect(paper).toContain('Never say you saved something');
  });

  it('tells the model a check must go another way, and how to keep a simulation in time', () => {
    const told = briefing({ language: 'cs', sheet, python: { numpy: false } });
    expect(told).toContain("Never write the sheet's formula again in Python");
    expect(told).toContain('Runge–Kutta 4');
    const words: CheckWords = { title: 'T', quantity: 'Q', difference: 'D', states: { agree: 'a', differ: 'd', missing: 'm', units: 'u', unit: 'n' }, failed: 'F', declined: 'X', none: 'N', output: 'O', ask: 'Oprav.', timeout: 'Zrychli.', missing: 'Výpočet v listu ještě není.', capped: 'Strop.' };
    expect(pythonReport([{ ok: false, error: 'timeout 30 s', output: '', rows: [] }], words, String)).toContain('Zrychli.');
    expect(pythonReport([{ ok: false, error: 'NameError: x', output: '', rows: [] }], words, String)).not.toContain('Zrychli.');
  });
});
