import { describe, expect, it } from 'vitest';
import { chartLayout, chartLookText, chartSvg, lookDifference, niceScale, parseChartLook, withLook, xPosition, xValueAt, yPosition, type ChartSpec } from '../src/index.js';

const line: ChartSpec = { kind: 'line', series: [{ label: 'M(x)', xs: [0, 2.5, 5], ys: [0, 37.5, 0] }], xTitle: 'x [m]', yTitle: 'M(x) [kN·m]' };

describe('chart', () => {
  it('has round ticks of 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceScale(0, 37.5).ticks).toEqual([0, 10, 20, 30, 40]);
    expect(niceScale(-0.3, 0.9).ticks).toEqual([-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
    expect(niceScale(5, 5).ticks.length).toBeGreaterThan(1);
    expect(niceScale(3, 7, 6, true).min).toBe(0);
  });

  it('ends the x axis at the data and maps values to the plot area and back', () => {
    const layout = chartLayout(line);
    expect([layout.x.min, layout.x.max]).toEqual([0, 5]);
    expect(xPosition(layout, 0)).toBe(layout.plot.left);
    expect(xPosition(layout, 5)).toBe(layout.plot.right);
    expect(yPosition(layout, 0)).toBe(layout.plot.bottom);
    expect(xValueAt(layout, (layout.plot.left + layout.plot.right) / 2)).toBeCloseTo(2.5, 9);
  });

  it('draws gaps, a legend for more curves and dashes that survive black-and-white print', () => {
    const svg = chartSvg({ ...line, series: [line.series[0]!, { label: 'V(x)', xs: [0, 2.5, 5], ys: [30, NaN, -30] }] });
    // The gap starts a new piece of the second curve.
    expect(svg.match(/<path d="M[^"]*M/g)).toHaveLength(1);
    expect(svg).toContain('stroke-dasharray="7 4"');
    expect(svg.match(/>V\(x\)</g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('stands bars on zero, one per category', () => {
    const layout = chartLayout({ kind: 'bar', series: [{ label: 'CF', xs: [1, 2, 3], ys: [-100, 30, 40] }], xTitle: '', yTitle: '' });
    expect(layout.categories).toEqual([1, 2, 3]);
    expect(layout.y.min).toBeLessThanOrEqual(-100);
    expect(xValueAt(layout, layout.plot.right - 1)).toBe(3);
  });

  it('reads and writes its look, the own one over the style of the calculation', () => {
    const look = parseChartLook('colors=#000000,#FF0000,red line=2,5 dashes=off markers=always grid=y frame font=13 legend=none names=off what=1');
    expect(look).toEqual({ colors: ['#000000', '#ff0000'], line: 2.5, dashes: false, markers: 'always', grid: 'y', frame: true, font: 13, legend: 'none', names: false });
    expect(parseChartLook(chartLookText(look))).toEqual(look);
    expect(chartLookText({})).toBe('');
    const style = { line: 3, grid: 'y' as const };
    expect(withLook(style, { grid: 'none' })).toEqual({ line: 3, grid: 'none' });
    // A chart keeps of its own only what differs from the style.
    expect(lookDifference({ line: 3, grid: 'none', frame: true }, style)).toEqual({ grid: 'none', frame: true });
  });

  it('is drawn in the look chosen', () => {
    const two: ChartSpec = { ...line, series: [line.series[0]!, { label: 'V(x)', xs: [0, 2.5, 5], ys: [30, 0, -30] }] };
    const usual = chartSvg(two);
    expect(usual).toContain('stroke="#2a78d6" stroke-width="2"');
    expect(usual).toContain('stroke-dasharray="7 4"');
    expect(usual).not.toContain('chart-frame');
    const own = chartSvg(two, { look: { colors: ['#111111', '#222222'], line: 3, dashes: false, frame: true, font: 13, legend: 'none', names: false, grid: 'none' } });
    expect(own).toContain('stroke="#111111" stroke-width="3"');
    expect(own).toContain('stroke="#222222" stroke-width="3"');
    expect(own).not.toContain('stroke-dasharray="7 4"');
    expect(own).toContain('class="chart-frame"');
    expect(own).toContain('font-size="13"');
    // No legend and no names at the ends: the label of a curve is not written at all.
    expect(own).not.toContain('>V(x)<');
    // No grid: of the lines across the plot only the axis is left.
    expect((own.match(/stroke="#e1e0d9"/g) ?? []).length).toBe(0);
    expect((usual.match(/stroke="#e1e0d9"/g) ?? []).length).toBeGreaterThan(3);
  });

  it('escapes texts', () => {
    expect(chartSvg({ ...line, xTitle: 'a < b & "c"' })).toContain('a &lt; b &amp; &quot;c&quot;');
  });
});
