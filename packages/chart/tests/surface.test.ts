import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { chartLayout, chartSvg, colormapOf, contourSegments, pngDataUri, surfaceLevels, type ChartSpec, type ChartSurface } from '../src/index.js';

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
});
