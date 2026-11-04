import { describe, expect, it } from 'vitest';
import { partOffset, chartLayout, chartLookText, chartSvg, lookDifference, niceScale, parseChartLook, withLook, xPosition, xValueAt, yPosition, type ChartSpec, logScale, yValueAt } from '../src/index.js';

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

describe('axes and lines edited by hand', () => {
  const curve = (xs: number[], ys: number[]) => ({ label: 'M(x)', xs, ys });

  it('draw a logarithmic axis: decades at even steps, nothing for what it cannot show', () => {
    expect(logScale(3, 70).ticks).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(logScale(3, 700).ticks).toEqual([1, 10, 100, 1000]);
    expect(logScale(1, 1e6)).toMatchObject({ min: 1, max: 1e6, ticks: [1, 10, 100, 1000, 10000, 100000, 1000000] });
    const spec: ChartSpec = { kind: 'line', series: [curve([1, 10, 100], [0, 5, 7])], xTitle: 'f', yTitle: 'A', xLog: true };
    const layout = chartLayout(spec);
    expect(xPosition(layout, 10) - xPosition(layout, 1)).toBeCloseTo(xPosition(layout, 100) - xPosition(layout, 10));
    expect(xValueAt(layout, xPosition(layout, 10))).toBeCloseTo(10);
    const logY = chartLayout({ ...spec, xLog: false, yLog: true });
    expect(yValueAt(logY, yPosition(logY, 5))).toBeCloseTo(5);
    expect(yPosition(logY, 0)).toBeNaN();
    // The zero is a gap of the curve, not a stroke to nowhere.
    expect(chartSvg({ ...spec, xLog: false, yLog: true })).not.toContain('NaN');
  });

  it('draw reference lines, and reach them when the axis follows the values', () => {
    const spec: ChartSpec = { kind: 'line', series: [curve([0, 1], [0, 10])], xTitle: 'x', yTitle: 'M', refs: [{ axis: 'y', at: 45, name: 'M_Rd', unit: 'kN·m' }, { axis: 'x', at: 0.5, unit: 'm', movable: true }] };
    expect(chartLayout(spec).y.max).toBeGreaterThanOrEqual(45);
    const svg = chartSvg(spec);
    expect(svg.match(/class="chart-ref"/g)).toHaveLength(2);
    // Only the plain number can be taken: a name of the sheet stays its value.
    expect(svg.match(/data-chart-drag="ref"/g)).toHaveLength(1);
    expect(svg).toContain('0.5 m');
  });

  it('read two places of the x axis: the curves between the points, and the differences', () => {
    const spec: ChartSpec = { kind: 'line', series: [curve([0, 2, 4], [0, 10, 20])], xTitle: 'x', yTitle: 'M', cursors: { from: 1, to: 3, name: 'x', xUnit: 'm', yUnit: 'kN' } };
    const svg = chartSvg(spec);
    expect(svg.match(/data-chart-drag="cursor"/g)).toHaveLength(2);
    expect(svg).toContain('Δx = 2 m');
    expect(svg).toContain('5 → 15, Δ = 10 kN');
  });

  it('cut off what lies beyond an x axis set by hand', () => {
    const spec: ChartSpec = { kind: 'points', series: [curve([0, 1, 2, 3], [1, 2, 3, 4])], xTitle: 'x', yTitle: 'y', xRange: [1, 2] };
    expect(chartLayout(spec).x).toMatchObject({ min: 1, max: 2 });
    expect(chartSvg(spec)).toMatch(/<svg x="\d+" y="\d+" width="\d+" height="\d+" viewBox=/);
  });
});

describe('the look of single parts', () => {
  const two: ChartSpec = { kind: 'line', series: [{ label: 'M(x)', xs: [0, 1], ys: [0, 1] }, { label: 'V(x)', xs: [0, 1], ys: [1, 0] }], xTitle: 'x [m]', yTitle: '[kN]' };
  const draw = (style: string) => chartSvg(two, { look: parseChartLook(style) });

  it('writes the parts into the text of the look and reads them back, what it does not know left out', () => {
    const text = 'line=3 s0.color=#d1495b yTitle.bold yTitle.font=Times_New_Roman yTitle.size=14';
    expect(chartLookText(parseChartLook(text))).toBe(text);
    expect(parseChartLook('yTitle.nonsense=1 foo.size=3').parts).toBeUndefined();
    expect(withLook(parseChartLook('xTitle.size=9 yTitle.size=9'), parseChartLook('yTitle.size=12')).parts).toEqual({ 'xTitle.size': '9', 'yTitle.size': '12' });
    expect(lookDifference(parseChartLook('xTitle.size=9 yTitle.size=12'), parseChartLook('xTitle.size=9')).parts).toEqual({ 'yTitle.size': '12' });
  });

  it('marks each part, for the editor to take it by', () => {
    const svg = chartSvg(two);
    for (const part of ['xTitle', 'yTitle', 'xTicks', 'yTicks', 'legend', 'names', 'axis', 's0', 's1']) expect(svg).toContain(`data-part="${part}"`);
  });

  it('draws a text with its font, size, weight, slant and colour', () => {
    const svg = draw('yTitle.font=Times_New_Roman yTitle.size=16 yTitle.bold yTitle.italic yTitle.color=#112233');
    expect(svg).toMatch(/data-part="yTitle" fill="#112233" font-family="'Times New Roman'" font-size="16" font-weight="bold" font-style="italic"/);
    // A name of a font cannot break out of its attribute.
    expect(draw(`yTitle.font=A"><script>`)).not.toContain('<script>');
    expect(parseChartLook(`yTitle.color="><script> grid.width=1"x plot.fill=red s0.dash=<b> s0.name=<i> yTitle.at=1,2" axis.color=#12345g`).parts).toBeUndefined();
  });

  it('turns the y title upwards, with room for it, and moves a title where it was dragged', () => {
    const usual = chartLayout(two);
    const up = chartLayout(two, { look: parseChartLook('yTitle.rotate=90') });
    expect(up.plot.left).toBeGreaterThan(usual.plot.left);
    expect(draw('yTitle.rotate=90')).toMatch(/data-part="yTitle"[^>]*transform="\s*rotate\(-90 /);
    expect(draw('xTitle.at=10,-5')).toMatch(/data-part="xTitle"[^>]*transform="translate\(10 -5\)/);
    expect(partOffset(parseChartLook('legend.at=4,7'), 'legend')).toEqual([4, 7]);
    expect(partOffset(undefined, 'legend')).toEqual([0, 0]);
  });

  it('puts the title over the chart as a heading when asked, with room for it', () => {
    const usual = chartLayout(two, { title: 'Moment' });
    const look = parseChartLook('title.place=top title.bold title.color=#112233');
    expect(chartLookText(look)).toBe('title.bold title.color=#112233 title.place=top');
    const headed = chartLayout(two, { title: 'Moment', look });
    expect(headed.plot.top).toBeGreaterThan(usual.plot.top);
    const svg = chartSvg(two, { title: 'Moment', look });
    expect(svg).toMatch(/data-part="title" fill="#112233" font-weight="bold"[^>]*>Moment</);
    // Not asked for, or without words, nothing is drawn; only "top" is a place.
    expect(chartSvg(two, { title: 'Moment' })).not.toContain('data-part="title"');
    expect(chartSvg(two, { look })).not.toContain('data-part="title"');
    expect(parseChartLook('title.place=left').parts).toBeUndefined();
  });

  it('draws notes where they were dragged, their words only as text', () => {
    const svg = draw('n0.text=Peak~here n0.at=20,30 n0.bold n1.text=<b>');
    expect(svg).toMatch(/data-part="n0"[^>]*font-weight="bold"[^>]*transform="translate\(20 30\)[^>]*>Peak here</);
    // What could be markup does not get in.
    expect(svg).not.toContain('<b>');
    expect(parseChartLook('n1.text=<b>').parts).toBeUndefined();
    expect(chartLookText(parseChartLook('n0.at=20,30 n0.text=Peak~here'))).toBe('n0.at=20,30 n0.text=Peak~here');
  });

  it('turns an axis round: the values go the other way and read back', () => {
    const usual = chartLayout(two);
    const turned = chartLayout(two, { look: parseChartLook('axis.xflip') });
    expect(xPosition(turned, 0)).toBeCloseTo(xPosition(usual, 1));
    expect(xPosition(turned, 1)).toBeCloseTo(xPosition(usual, 0));
    expect(xValueAt(turned, xPosition(turned, 0.25))).toBeCloseTo(0.25);
    const up = chartLayout(two, { look: parseChartLook('axis.yflip') });
    expect(yPosition(up, 0)).toBeLessThan(yPosition(up, 1));
    expect(yValueAt(up, yPosition(up, 0.25))).toBeCloseTo(0.25);
  });

  it('sets the spacing of the numbers of an axis, and draws the lines through zero', () => {
    const layout = chartLayout(two, { look: parseChartLook('axis.xstep=0.25 axis.ystep=0.5') });
    expect(layout.x.ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(layout.y.ticks).toEqual([0, 0.5, 1]);
    expect(parseChartLook('axis.xstep=0').parts).toBeUndefined();
    // So many numbers that nobody could read them: the axis keeps its own.
    expect(chartLayout(two, { look: parseChartLook('axis.xstep=0.0001') }).x.ticks).toEqual(chartLayout(two).x.ticks);
    expect(draw('axis.zero')).toContain('class="chart-zero"');
    expect(chartSvg(two)).not.toContain('class="chart-zero"');
  });

  it('gives bigger text the room it needs', () => {
    const usual = chartLayout(two);
    const big = chartLayout(two, { look: parseChartLook('xTicks.size=18 xTitle.size=18 yTicks.size=18') });
    expect(big.plot.bottom).toBeLessThan(usual.plot.bottom);
    expect(big.plot.left).toBeGreaterThan(usual.plot.left);
  });

  it('draws a curve, the axes, the grid and the plot as set', () => {
    const svg = draw('s0.color=#123456 s0.width=4 s0.dash=dot s1.name=Posouvající~síla axis.color=#654321 axis.width=2 grid.color=#abcdef grid.dash=dash grid.width=2 plot.fill=#fafafa');
    expect(svg).toContain('stroke="#123456" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="2 3"');
    expect(svg).toContain('Posouvající síla');
    expect(svg).toContain('stroke="#654321" stroke-width="2"');
    expect(svg).toMatch(/<line stroke-dasharray="7 4"[^>]*stroke="#abcdef" stroke-width="2"/);
    expect(svg).toContain('class="chart-plot-fill"');
  });
});

