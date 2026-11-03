import { describe, expect, it } from 'vitest';
import { axisRangeText, axisValueText, movedRange, zoomedRange } from '../src/logic/chartView.js';

describe('what a chart shows, changed by the mouse', () => {
  it('zooms about the place under the pointer, which stays where it is', () => {
    expect(zoomedRange({ min: 0, max: 10 }, 5, 0.5)).toEqual([2.5, 7.5]);
    expect(zoomedRange({ min: 0, max: 10 }, 0, 0.5)).toEqual([0, 5]);
    expect(zoomedRange({ min: 0, max: 10 }, 5, 2)).toEqual([-5, 15]);
  });

  it('zooms a logarithmic axis by ratios', () => {
    const [low, high] = zoomedRange({ min: 1, max: 10000, log: true }, 100, 0.5);
    expect(low).toBeCloseTo(10);
    expect(high).toBeCloseTo(1000);
  });

  it('moves by a share of the axis, on a logarithmic one by a ratio', () => {
    expect(movedRange({ min: 0, max: 10 }, 0.1)).toEqual([1, 11]);
    const [low, high] = movedRange({ min: 1, max: 100, log: true }, 0.5);
    expect(low).toBeCloseTo(10);
    expect(high).toBeCloseTo(1000);
  });

  it('writes a range as the line writes it, as exact as the span needs', () => {
    expect(axisRangeText([1.5, 3], 'm')).toBe('1.5 m .. 3 m');
    expect(axisRangeText([1.23456789, 3.3333333], 'm')).toBe('1.235 m .. 3.333 m');
    expect(axisRangeText([0.001234, 0.0025], '')).toBe('0.001234 .. 0.0025');
    expect(axisRangeText([12.3456, 98765.4], 'Hz', true)).toBe('12.35 Hz .. 98770 Hz');
    expect(axisValueText(42.123456, 50, 'kN·m')).toBe('42.12 kN·m');
  });
});
