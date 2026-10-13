import { describe, expect, it } from 'vitest';
import { chartLayout, xPosition, yPosition, type ChartSpec } from '@kalketa/chart';
import { nearestOnCurve } from '../src/logic/chartPoint.js';

// A narrow parabola, y = −2·x² + 2·x + 10 over −10 .. 10, the y axis −50 .. 20: most of it out of the chart.
const f = (x: number) => -2 * x * x + 2 * x + 10;
const xs = Array.from({ length: 201 }, (_, i) => -10 + i * 0.1);
const spec: ChartSpec = { kind: 'line', series: [{ label: 'y', xs, ys: xs.map(f) }], xTitle: 'x', yTitle: 'y', yRange: [-50, 20] };
const chart = { spec, layout: chartLayout(spec, { width: 640, height: 371 }) };

describe('the point of a tangent dragged along the curve', () => {
  it('is on the curve at the x of the pointer, wherever the pointer is above or below it', () => {
    const { layout } = chart;
    // Between the two close branches, far below the curve, above it: the x of the pointer each time, no jump.
    for (const [x, y] of [[0.3, -30], [3, 15], [-2.5, -45], [1.7, 19]] as const) {
      expect(nearestOnCurve(chart, xPosition(layout, x), yPosition(layout, y))).toBeCloseTo(x, 6);
    }
  });

  it('stops at the visible part of the curve where it is out of the chart, and gives nothing for no position', () => {
    const { layout } = chart;
    // At x = 8 the curve is at −102, below the axis set by hand: the nearest place of it inside the chart.
    const x = nearestOnCurve(chart, xPosition(layout, 8), yPosition(layout, -45))!;
    expect(f(x)).toBeGreaterThanOrEqual(-50);
    expect(x).toBeGreaterThan(3);
    expect(nearestOnCurve(chart, Number.NaN, 10)).toBeUndefined();
  });
});
