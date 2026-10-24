import { describe, expect, it } from 'vitest';
import { autocorrect, completionsFor, wordToComplete, type Completion } from '../src/logic/shortcuts.js';

const none = () => false;
const typed = (text: string) => autocorrect(text, text.length, none)?.text;

describe('corrections of what was just typed', () => {
  it('writes the signs as printed', () => {
    expect(typed('x <=')).toBe('x ≤');
    expect(typed('x >=')).toBe('x ≥');
    expect(typed('a !=')).toBe('a ≠');
    expect(typed('q*')).toBe('q·');
    expect(typed('a ==')).toBeUndefined();
    expect(typed('a :=')).toBeUndefined();
  });

  it('turns names of Greek letters into the letters when the word ends, also before an index', () => {
    expect(typed('alpha ')).toBe('α ');
    expect(typed('x := sigma_')).toBe('x := σ_');
    expect(typed('Omega)')).toBe('Ω)');
    expect(typed('2·alpha*')).toBe('2·α·');
    expect(typed('beta<=')).toBe('β≤');
    expect(typed('alphabet ')).toBeUndefined();
    expect(typed('x_alpha ')).toBeUndefined();
    expect(autocorrect('beta ', 5, (n) => n === 'beta')).toBeUndefined();
  });

  it('leaves strings and comments alone', () => {
    expect(typed('"x <=')).toBeUndefined();
    expect(typed("q := 5  ' alpha ")).toBeUndefined();
    expect(typed('check "a*')).toBeUndefined();
  });
});

describe('completion while typing', () => {
  const all: Completion[] = [
    { name: 'M_Ed', kind: 'value', detail: '54 kN·m' },
    { name: 'M_Ek', kind: 'value', detail: '38,25 kN·m' },
    { name: 'max', kind: 'function', detail: 'max(a; b; …)' },
    { name: 'mean', kind: 'function', detail: 'mean(x)' },
  ];

  it('completes a name after an operator, not at the start of a line, after a number or in a string', () => {
    expect(wordToComplete('σ := M_E', 8)).toEqual({ word: 'M_E', from: 5 });
    expect(wordToComplete('M_E', 3)).toBeUndefined();
    expect(wordToComplete('q := 12 k', 9)).toBeUndefined();
    expect(wordToComplete('check "M_E', 10)).toBeUndefined();
  });

  it('offers the names starting with it, as typed first, then in any case', () => {
    expect(completionsFor(all, 'M_E').map((c) => c.name)).toEqual(['M_Ed', 'M_Ek']);
    expect(completionsFor(all, 'm').map((c) => c.name)).toEqual(['max', 'mean', 'M_Ed', 'M_Ek']);
    expect(completionsFor(all, 'max')).toEqual([]);
  });
});
