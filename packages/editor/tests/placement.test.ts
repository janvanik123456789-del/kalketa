import { describe, expect, it } from 'vitest';
import { placeable, withPlotPlace } from '../src/logic/placement.js';

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
