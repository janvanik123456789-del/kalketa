import { describe, expect, it } from 'vitest';
import { estimateTokens, planJump, sentTokens, windowTurns, type ChatTurn } from '../src/index.js';

const turn = (role: 'user' | 'assistant', chars: number, mark = ''): ChatTurn => ({ role, text: `${mark}${'x'.repeat(chars)}` });

describe('the conversation window', () => {
  // 20 exchanges of a question (300 characters) and an answer (6000): about 70 000 tokens.
  const turns = Array.from({ length: 20 }, (_, i) => [turn('user', 300, `Q${i}:`), turn('assistant', 6000, `A${i}:`)]).flat();

  it('sends everything while it fits', () => {
    expect(planJump(turns.slice(0, 4), undefined, 8000, 32_768)).toBeUndefined();
    expect(windowTurns(turns.slice(0, 4), undefined)).toHaveLength(4);
  });

  it('jumps once past the limit: the cut is a question, the turns kept fit a quarter of the context', () => {
    const upTo = planJump(turns, undefined, 8000, 32_768)!;
    expect(turns[upTo]!.role).toBe('user');
    const kept = turns.slice(upTo).reduce((n, t) => n + estimateTokens(t.text) + 4, 0);
    // With the briefing and the summary, what is left after a jump is about a third of the context.
    expect(8000 + 1000 + kept).toBeLessThanOrEqual(32_768 * 0.35 + estimateTokens(turns[upTo + 1]!.text) + 4);
    const window = { upTo, summary: 'Shrnutí.' };
    const sent = windowTurns(turns, window);
    expect(sent[0]!.text).toContain('Shrnutí.');
    expect(sent[2]).toEqual(turns[upTo]);
    expect(sentTokens(turns, window, 8000)).toBeLessThan(32_768 * 0.6);
  });

  it('leaves room for several questions after a jump, not one', () => {
    // A briefing and a sheet of 12 000 tokens, questions going with a state of 4 000 tokens each, answers of 700.
    const ask = (i: number): ChatTurn[] => [{ role: 'user', text: `Q${i}`, sent: 'x'.repeat(12_000) }, turn('assistant', 2100)];
    let turns: ChatTurn[] = [];
    let window: { upTo: number; summary: string } | undefined;
    let jumps = 0;
    for (let i = 0; i < 30; i++) {
      turns = [...turns, ...ask(i)].slice(0, -1);
      const upTo = planJump(turns, window, 12_000, 65_536);
      if (upTo !== undefined) {
        jumps++;
        window = { upTo, summary: 'S'.repeat(3000) };
      }
      turns = [...turns, turn('assistant', 2100)];
    }
    // 30 questions in a context of 64 K: a jump every few questions, not at each.
    expect(jumps).toBeLessThanOrEqual(12);
    expect(jumps).toBeGreaterThan(0);
  });

  it('keeps the window while it fits, so the start of what is sent stays the same', () => {
    const upTo = planJump(turns, undefined, 8000, 32_768)!;
    const window = { upTo, summary: 'Shrnutí.' };
    const next = [...turns, turn('user', 300, 'Q20:')];
    expect(planJump(next, window, 8000, 32_768)).toBeUndefined();
    expect(windowTurns(next, window).slice(0, 4)).toEqual(windowTurns(turns, window).slice(0, 4));
  });

  it('keeps the latest question even when it alone is long', () => {
    const long = [turn('user', 300), turn('assistant', 300), turn('user', 200_000)];
    expect(planJump(long, undefined, 8000, 32_768)).toBe(2);
    expect(planJump([turn('user', 200_000)], undefined, 8000, 32_768)).toBeUndefined();
  });
});
