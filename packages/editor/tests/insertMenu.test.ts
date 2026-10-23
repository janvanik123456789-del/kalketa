import { describe, expect, it } from 'vitest';
import { insertQuery, matchingChoices, type InsertChoice } from '../src/logic/insertMenu.js';

const choices: InsertChoice[] = [
  { id: 'definition', icon: '≔', label: 'Definice', example: 'a := 1', template: '‸ := ', keywords: 'definition value' },
  { id: 'check', icon: '✓', label: 'Posudek', example: 'check "": ', template: 'check "‸": ', keywords: 'check kontrola' },
  { id: 'position', icon: 'Pos', label: 'Nová pozice', example: '## S1 {pos}', template: '## ‸ {pos}' },
  { id: 'chart', icon: '∿', label: 'Graf…', example: 'plot(…)', keywords: 'chart plot' },
];

describe('the "/" menu of an empty line', () => {
  it('asks for the menu only by "/" and letters at the start of a line', () => {
    expect(insertQuery('/')).toBe('');
    expect(insertQuery('/pos')).toBe('pos');
    expect(insertQuery('/řeš')).toBe('řeš');
    expect(insertQuery('a/b')).toBeUndefined();
    expect(insertQuery('/ x')).toBeUndefined();
    expect(insertQuery('q := 5 kN/m')).toBeUndefined();
  });

  it('narrows the choices by the start of a word of their name or other words, without diacritics', () => {
    expect(matchingChoices(choices, '').map((c) => c.id)).toEqual(['definition', 'check', 'position', 'chart']);
    expect(matchingChoices(choices, 'pos').map((c) => c.id)).toEqual(['check', 'position']);
    expect(matchingChoices(choices, 'poz').map((c) => c.id)).toEqual(['position']);
    expect(matchingChoices(choices, 'nova').map((c) => c.id)).toEqual(['position']);
    expect(matchingChoices(choices, 'plot').map((c) => c.id)).toEqual(['chart']);
    expect(matchingChoices(choices, 'xyz')).toEqual([]);
  });
});
