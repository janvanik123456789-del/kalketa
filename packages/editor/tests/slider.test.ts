import { describe, expect, it } from 'vitest';
import { inputNumber, sliderStep, sliderValue, withInputNumber } from '../src/logic/slider.js';

describe('the slider of an input', () => {
  it('finds the plain number of the line, with its unit and marks after it', () => {
    expect(inputNumber('a := -2 {slider=-5..5}')).toEqual({ start: 5, end: 7, value: -2 });
    expect(inputNumber('L := 4.5 m {slider=1..10}')?.value).toBe(4.5);
    expect(inputNumber('q_d := 12 kN/m  \' a note')?.value).toBe(12);
    expect(inputNumber('b := a + 1')).toBeUndefined();
    expect(inputNumber('y(x) := 2')).toBeUndefined();
  });

  it('writes the value in place, rounded to the step of the slider', () => {
    expect(withInputNumber('a := -2 {slider=-5..5}', 3.5)).toBe('a := 3.5 {slider=-5..5}');
    expect(withInputNumber('L := 4.5 m', 6)).toBe('L := 6 m');
    expect(sliderStep({ low: -5, high: 5 })).toBe(0.1);
    expect(sliderStep({ low: 0, high: 1000 })).toBe(10);
    expect(sliderValue({ low: -5, high: 5 }, 0.637)).toBe(1.4);
    expect(sliderValue({ low: -5, high: 5, step: 0.5 }, 0.637)).toBe(1.5);
    expect(sliderValue({ low: -5, high: 5 }, 2)).toBe(5);
  });
});
