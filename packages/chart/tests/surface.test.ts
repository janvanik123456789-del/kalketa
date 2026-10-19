import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cellOutline, chartLayout, chartSvg, cutChart, colormapOf, contourSegments, edgeLookup, parseView, pngDataUri, surfaceLevels, viewText, type ChartSpec, type ChartSurface } from '../src/index.js';

/** z = x + y over 0 .. 4 × 0 .. 2, on a grid of 5 × 3 points. */
const xs = [0, 1, 2, 3, 4];
const ys = [0, 1, 2];
const plane: ChartSurface = { xs, ys, z: xs.map((x) => ys.map((y) => x + y)), zTitle: 'z [mm]' };
const map: ChartSpec = { kind: 'map', series: [], xTitle: 'x [m]', yTitle: 'y [m]', xRange: [0, 4], yRange: [0, 2], surface: plane };

describe('a surface drawn as a map', () => {
  it('has contour lines where z crosses a level, on the line of that value', () => {
    const segments = contourSegments(plane, 3);
    expect(segments.length).toBeGreaterThan(0);
    // Every point of the line x + y = 3.
    for (const [a, b, c, d] of segments) {
      expect(a + b).toBeCloseTo(3, 6);
      expect(c + d).toBeCloseTo(3, 6);
    }
    expect(contourSegments(plane, 10)).toEqual([]);
  });

  it('takes round levels inside its range, or those given, and colours by them', () => {
    expect(surfaceLevels(plane)).toEqual([1, 2, 3, 4, 5]);
    expect(surfaceLevels({ ...plane, levels: [-1, 2.5, 9] })).toEqual([2.5]);
    expect(colormapOf(plane, 'auto')).toBe('sequential');
    // Moments to both sides of zero: blue and red round a white zero.
    expect(colormapOf({ ...plane, z: plane.z.map((c) => c.map((v) => v - 3)) }, 'auto')).toBe('diverging');
    expect(colormapOf(plane, 'gray')).toBe('gray');
  });

  it('is a picture of the colours, contour lines with their values and a colour bar with the unit', () => {
    const svg = chartSvg(map);
    expect(svg).toContain('<image class="chart-map"');
    expect(svg).toContain('class="chart-contour"');
    expect(svg).toContain('class="chart-colorbar"');
    expect(svg).toContain('>z [mm]</text>');
    // The bar takes room at the right: the plot ends before it.
    expect(chartLayout(map).plot.right).toBeLessThan(chartLayout({ ...map, surface: undefined as never }).plot.right);
    expect(chartSvg(map, { look: { colormap: 'gray' } })).toContain('kalketa-bar-gray');
  });

  it('writes a picture any PNG reader reads', () => {
    const rgba = new Uint8Array(3 * 2 * 4).map((_, i) => (i * 37) % 256);
    const uri = pngDataUri(3, 2, rgba);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    const png = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // The data of IDAT inflates to the rows, each after its filter byte.
    const idat = png.indexOf('IDAT');
    const length = png.readUInt32BE(idat - 4);
    const rows = inflateSync(png.subarray(idat + 4, idat + 4 + length));
    expect([...rows]).toEqual([0, ...rgba.subarray(0, 12), 0, ...rgba.subarray(12)]);
  });

  it('in 3D is shaded cells in a box with ticks, from the view asked, and its colour bar', () => {
    const solid: ChartSpec = { ...map, kind: 'surface' };
    const svg = chartSvg(solid);
    expect(svg).toContain('class="chart-surface"');
    // A patch for each cell of the grid (4 × 2), besides the floor and two walls of the box.
    const patches = /<g class="chart-surface">(.*?)<\/g>/.exec(svg)![1]!;
    expect((patches.match(/<path /g) ?? []).length).toBe(4 * 2);
    expect(svg).toContain('class="chart-colorbar"');
    expect(svg).not.toContain('<image');
    // Another view draws the same cells elsewhere.
    expect(chartSvg({ ...solid, surface: { ...plane, view: { az: -60, el: 60 } } })).not.toBe(svg);
    expect(parseView('az=400 el=95')).toEqual({ az: 40, el: 90 });
    expect(viewText({ az: 35.4, el: 29.6 })).toBe('az=35 el=30');
  });
  it('with a cut draws its line, and the curve along it is a chart of its own, at one scale where the units agree', () => {
    const cut = { axis: 'y' as const, at: 1, along: xs, z: xs.map((x) => x + 1), label: 'y = 1 m', title: 'Řez y = 1 m' };
    const withCut: ChartSpec = { ...map, surface: { ...plane, cut, points: [{ x: 3, y: 0.5, z: 3.5 }] } };
    const svg = chartSvg(withCut, { height: 300 });
    expect(svg).toContain('class="chart-cut-line"');
    expect(svg).toContain('class="chart-point"');
    expect(svg).not.toContain('Řez y = 1 m');
    const own = cutChart(withCut)!;
    expect(own.spec.series[0]!.ys).toEqual(cut.z);
    expect(own.svg).toContain('class="chart-svg"');
    // At one scale: z from 1 to 5 over x from 0 to 4 makes the plot as high as it is wide.
    const equal = cutChart({ ...withCut, surface: { ...withCut.surface!, cut: { ...cut, equalScale: true } } })!;
    const plot = equal.layout.plot;
    expect((plot.bottom - plot.top) / (equal.layout.y.max - equal.layout.y.min)).toBeCloseTo((plot.right - plot.left) / (equal.layout.x.max - equal.layout.x.min), 0);
    expect(cutChart(map)).toBeUndefined();
  });
  it('on its edge is cut where the surface ends between the points of the grid, not in steps of whole cells', () => {
    // A cell with three corners of value: the fourth side has none; the surface ends 0,4 of the way to it.
    const z = [[1, 1], [1, NaN]];
    const edge: ChartSurface = { xs: [0, 1], ys: [0, 1], z, zTitle: 'z', edges: [{ i: 1, j: 0, dir: 'y', t: 0.4, z: 0.5 }, { i: 0, j: 1, dir: 'x', t: 0.6, z: 0.5 }] };
    expect(cellOutline(edge, 0, 0, edgeLookup(edge))).toEqual([
      { fx: 0, fy: 0, z: 1 },
      { fx: 1, fy: 0, z: 1 },
      { fx: 1, fy: 0.4, z: 0.5 },
      { fx: 0.6, fy: 1, z: 0.5 },
      { fx: 0, fy: 1, z: 1 },
    ]);
    // In 3D the cell is drawn as that polygon of five points.
    const svg = chartSvg({ kind: 'surface', series: [], xTitle: 'x', yTitle: 'y', surface: edge });
    const patches = /<g class="chart-surface">(.*?)<\/g>/.exec(svg)![1]!;
    expect((patches.match(/L/g) ?? []).length).toBe(4);
  });
});
