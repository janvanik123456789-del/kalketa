import { describe, expect, it } from 'vitest';
import { currentOption, FUNCTION_OPTIONS, optionValue, setOption, solveDomain, withOption, withSolveDomain } from '../src/logic/functionOptions.js';

const option = (fn: string, name: string) => FUNCTION_OPTIONS[fn]!.find((o) => o.name === name)!;

describe('options of functions served in Details', () => {
  it('read and write a named option of a call anywhere in the line', () => {
    const line = 'T_fit := fit(Mereni.T, x: Mereni.t, kind: "exp") {decimals=2}';
    expect(optionValue(line, 'fit', 'kind')).toBe('"exp"');
    expect(withOption(line, 'fit', 'kind', '"log"')).toBe('T_fit := fit(Mereni.T, x: Mereni.t, kind: "log") {decimals=2}');
    expect(withOption(line, 'fit', 'kind', undefined)).toBe('T_fit := fit(Mereni.T, x: Mereni.t) {decimals=2}');
    expect(withOption(line, 'fit', 'steps', 'true')).toBe('T_fit := fit(Mereni.T, x: Mereni.t, kind: "exp", steps: true) {decimals=2}');
    // Not fooled by a text or by another call: max(…) in the arguments, "fit(" in quotes.
    expect(optionValue('y := max(fit(a, x: b)(2), 3) ' + '"fit(x, kind: 1)"', 'fit', 'kind')).toBeUndefined();
  });

  it('leave a choice at its default and a flag that is off out of the line', () => {
    const line = 'P := fit(D.y, x: D.x, kind: "poly2", steps: true)';
    expect(currentOption(line, 'fit', option('fit', 'kind'))).toBe('"poly2"');
    expect(currentOption(line, 'fit', option('fit', 'steps'))).toBe('true');
    expect(setOption(line, 'fit', option('fit', 'kind'), '"linear"')).toBe('P := fit(D.y, x: D.x, steps: true)');
    expect(setOption(line, 'fit', option('fit', 'steps'), 'false')).toBe('P := fit(D.y, x: D.x, kind: "poly2")');
    expect(currentOption('d := derivative(f(x), x: 2)', 'derivative', option('derivative', 'order'))).toBe('1');
    expect(setOption('d := derivative(f(x), x: 2)', 'derivative', option('derivative', 'order'), '2')).toBe('d := derivative(f(x), x: 2, order: 2)');
    expect(setOption('plot(f(x), x: 0 .. 1) | mm', 'plot', option('plot', 'roots'), 'true')).toBe('plot(f(x), x: 0 .. 1, roots: true) | mm');
  });

  it('read and change the set of a solve line', () => {
    expect(solveDomain('solve x: x^2 == 4')).toBe('');
    expect(solveDomain('solve n ∈ ℕ, n > 1: n^2 == 4')).toBe('ℕ');
    expect(solveDomain('solve (x, y): x + y == 1, x - y == 0')).toBeUndefined();
    expect(solveDomain('solve w(x): w″ == 1')).toBeUndefined();
    expect(solveDomain('x := 2')).toBeUndefined();
    expect(withSolveDomain('solve x: x^2 == 4', 'ℝ')).toBe('solve x ∈ ℝ: x^2 == 4');
    expect(withSolveDomain('solve n ∈ ℕ, n > 1: n^2 == 4', 'ℤ')).toBe('solve n ∈ ℤ, n > 1: n^2 == 4');
    expect(withSolveDomain('solve x ∈ ℝ: x^2 == 4', '')).toBe('solve x: x^2 == 4');
  });
});
