import { describe, expect, it } from 'vitest';
import { placeable, plotFlag, plotShowsRoots, plotYRange, withPlotFlag, withPlotPlace, withPlotRoots, withPlotYRange } from '../src/logic/placement.js';

describe('placement of pictures and charts', () => {
  it('reads and writes the place option of a chart line', () => {
    const line = 'plot(M(x), x: 0 m .. L, title: "Moment (kN)") | kN·m';
    const chart = placeable(line)!;
    expect(chart.kind).toBe('chart');
    expect(chart.place).toEqual({});
    const placed = chart.write({ width: 40, wrap: 'right', dy: 8 });
    expect(placed).toBe('plot(M(x), x: 0 m .. L, title: "Moment (kN)", place: "width=40% wrap=right dy=8mm") | kN·m');
    expect(placeable(placed)!.place).toEqual({ width: 40, wrap: 'right', dy: 8 });
    expect(placeable(placed)!.write({ align: 'left' })).toBe('plot(M(x), x: 0 m .. L, title: "Moment (kN)", place: "align=left") | kN·m');
    expect(withPlotPlace(placed, '')).toBe(line);
  });

  it('reads a picture line the same way', () => {
    const picture = placeable('![S](a.png){width=30% wrap=left}')!;
    expect(picture.kind).toBe('picture');
    expect(picture.write({ ...picture.place, dx: 10 })).toBe('![S](a.png){width=30% wrap=left dx=10%}');
    expect(placeable('L := 5 m')).toBeUndefined();
  });
});

describe('the range of the y axis of a chart', () => {
  it('is read from its line, set, changed and taken away', () => {
    const line = 'plot(y(x), x: -3 .. 2, place: "width=40%")';
    expect(plotYRange(line)).toBeUndefined();
    const set = withPlotYRange(line, '-15 .. 15');
    expect(set).toBe('plot(y(x), x: -3 .. 2, place: "width=40%", ylim: -15 .. 15)');
    expect(plotYRange(set)).toBe('-15 .. 15');
    expect(withPlotYRange(set, '0 kN·m .. 50 kN·m')).toBe('plot(y(x), x: -3 .. 2, place: "width=40%", ylim: 0 kN·m .. 50 kN·m)');
    expect(withPlotYRange(set, undefined)).toBe(line);
  });
});

describe('the roots marked in a chart', () => {
  it('are switched on and off in its line', () => {
    const line = 'plot(y(x), x: -3 .. 2)';
    expect(plotShowsRoots(line)).toBe(false);
    const on = withPlotRoots(line, true);
    expect(on).toBe('plot(y(x), x: -3 .. 2, roots: true)');
    expect(plotShowsRoots(on)).toBe(true);
    expect(withPlotRoots(on, false)).toBe(line);
  });
});

describe('the axis of symmetry in a chart', () => {
  it('is switched on and off in its line, beside the other options', () => {
    const line = 'plot(y(x), x: -3 .. 2, roots: true)';
    const on = withPlotFlag(line, 'symmetry', true);
    expect(on).toBe('plot(y(x), x: -3 .. 2, roots: true, symmetry: true)');
    expect(plotFlag(on, 'symmetry')).toBe(true);
    expect(plotFlag(on, 'roots')).toBe(true);
    expect(withPlotFlag(on, 'symmetry', false)).toBe(line);
  });
});
