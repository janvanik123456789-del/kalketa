import { describe, expect, it } from 'vitest';
import { applyProposal, briefing, parseProposals, replacedLines, withoutProposals } from '@kalketa/ai';

const fence = '`'.repeat(3);
const answer = [
  'Zvolil bych IPE 220:',
  `${fence}change 8`,
  'profil := pick(Profily_IPE, "IPE 220")',
  fence,
  'A doplnit vlastní tíhu:',
  `${fence}change after 6`,
  'g := 0,26 kN/m',
  fence,
  'Řádky 20 až 21 nejsou potřeba:',
  `${fence}change 20-21`,
  fence,
  `${fence}change 9`,
  '  9 | q_d := q + g',
  fence,
].join('\n');

describe('changes the model proposes', () => {
  it('are read from their blocks: replace, insert, delete', () => {
    expect(parseProposals(answer)).toEqual([
      { from: 8, to: 8, lines: ['profil := pick(Profily_IPE, "IPE 220")'] },
      { from: 6, to: 6, insert: true, lines: ['g := 0,26 kN/m'] },
      { from: 20, to: 21, lines: [] },
      { from: 9, to: 9, lines: ['q_d := q + g'] },
    ]);
  });

  it('apply to the calculation, and see whether the lines are still there', () => {
    const source = ['a := 1', 'b := 2', 'c := 3'].join('\n');
    expect(applyProposal(source, { from: 2, to: 2, lines: ['b := 20'] })).toBe('a := 1\nb := 20\nc := 3');
    expect(applyProposal(source, { from: 1, to: 1, insert: true, lines: ['x := 0'] })).toBe('a := 1\nx := 0\nb := 2\nc := 3');
    expect(applyProposal(source, { from: 0, to: 0, insert: true, lines: ['x := 0'] })).toBe('x := 0\na := 1\nb := 2\nc := 3');
    expect(applyProposal(source, { from: 2, to: 3, lines: [] })).toBe('a := 1');
    expect(replacedLines(source, { from: 2, to: 3, lines: [] })).toEqual(['b := 2', 'c := 3']);
    expect(replacedLines(source, { from: 3, to: 5, lines: [] })).toBeUndefined();
  });

  it('are shown apart from the text of the answer', () => {
    expect(withoutProposals(answer, (n) => `[návrh ${n}]`).split('\n')).toEqual(['Zvolil bych IPE 220:', '[návrh 1]', 'A doplnit vlastní tíhu:', '[návrh 2]', 'Řádky 20 až 21 nejsou potřeba:', '[návrh 3]', '[návrh 4]']);
  });

  it('are asked for in the briefing', () => {
    expect(briefing({ language: 'cs', sheet: { title: 'N1', source: 'L := 5 m' } })).toContain('```change 8');
  });
});
