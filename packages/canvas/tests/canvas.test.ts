import { describe, expect, it } from 'vitest';
import { addItem, drawn, turned, emptyScene, endMoved, itemAt, migrate, moved, newId, readScene, reordered, resized, sceneSvg, writeScene, type CanvasItem } from '../src/index.js';

const rect: CanvasItem = { id: 'i1', type: 'rect', x: 10, y: 10, w: 20, h: 10, stroke: { color: '#000', width: 0.5 }, fill: 'none' };

describe('canvas scene', () => {
  it('is drawn as SVG in millimetres and read back', () => {
    const scene = addItem(addItem(emptyScene(100, 50), rect), { id: 'i2', type: 'arrow', x1: 0, y1: 0, x2: 50, y2: 25, stroke: { color: '#c00', width: 0.4 } });
    const svg = sceneSvg(scene);
    expect(svg).toContain('width="100mm" height="50mm" viewBox="0 0 100 50"');
    expect(svg).toContain('<rect x="10" y="10" width="20" height="10"');
    expect(svg).toContain('marker-end="url(#cc-arrow-c00)"');
    expect(readScene(writeScene(scene))).toEqual(scene);
    expect(readScene(new TextEncoder().encode('nonsense')).items).toEqual([]);
  });

  it('reads scenes of other format versions', () => {
    // A scene saved without a version is version 1; a newer one is kept, its unknown items are not drawn.
    expect(readScene(new TextEncoder().encode('{"width":50,"height":20,"items":[]}')).version).toBe(1);
    const newer = migrate({ version: 99, width: 50, height: 20, items: [{ id: 'x', type: 'hologram' } as unknown as CanvasItem] });
    expect(newer.version).toBe(99);
    expect(sceneSvg(newer)).not.toContain('undefined');
  });

  it('escapes text and draws pictures from the files of the sheet', () => {
    const scene = addItem(emptyScene(), { id: 'i1', type: 'text', x: 5, y: 5, text: 'q < 12 kN/m\nL = 5 m', size: 4, color: '#000' });
    const withPicture = addItem(scene, { id: 'i2', type: 'image', x: 0, y: 0, w: 30, h: 20, src: 'canvases/a/foto.png' });
    const svg = sceneSvg(withPicture, (path) => `data:${path}`);
    expect(svg).toContain('q &lt; 12 kN/m');
    expect(svg).toContain('<tspan x="5" dy="5">L = 5 m</tspan>');
    expect(svg).toContain('href="data:canvases/a/foto.png"');
  });
});

describe('editing a canvas', () => {
  it('moves, resizes from a corner and keeps the proportions of a picture', () => {
    expect(moved(rect, 5, -2)).toMatchObject({ x: 15, y: 8 });
    expect(resized(rect, 'se', 40, 30)).toMatchObject({ x: 10, y: 10, w: 30, h: 20 });
    expect(resized(rect, 'nw', 0, 5)).toMatchObject({ x: 0, y: 5, w: 30, h: 15 });
    const picture: CanvasItem = { id: 'p', type: 'image', x: 0, y: 0, w: 40, h: 20, src: 'x.png' };
    expect(resized(picture, 'se', 80, 10)).toMatchObject({ w: 80, h: 40 });
  });

  it('draws shapes, finds them and changes their order', () => {
    let scene = emptyScene();
    scene = addItem(scene, drawn('rect', newId(scene), 30, 20, 10, 5, '#000', 0.5, 'none'));
    expect(scene.items[0]).toMatchObject({ x: 10, y: 5, w: 20, h: 15 });
    scene = addItem(scene, drawn('line', newId(scene), 0, 0, 40, 0, '#000', 0.5, 'none'));
    expect(itemAt(scene, 20, 0.8)?.type).toBe('line');
    expect(itemAt(scene, 20, 12)?.type).toBe('rect');
    expect(itemAt(scene, 90, 80)).toBeUndefined();
    expect(reordered(scene, 'i2', 'back').items.map((i) => i.id)).toEqual(['i2', 'i1']);
    expect(endMoved(scene.items[1]!, 2, 10, 10)).toMatchObject({ x2: 10, y2: 10 });
  });
});

describe('drawings of mechanics: dimensions, arcs and moments, hatches', () => {
  it('draws a dimension beside its points, its label on the line, both arrowheads', () => {
    const dimension = drawn('dimension', 'd1', 10, 40, 60, 40, '#000', 0.25, 'none', 'l', 3.5);
    expect(dimension).toMatchObject({ type: 'dimension', offset: 6, text: 'l' });
    const svg = sceneSvg(addItem(emptyScene(), dimension));
    // Drawn from left to right, it stands above the points (y 40 − 6).
    expect(svg).toContain('<line x1="10" y1="34" x2="60" y2="34"');
    expect(svg).toContain('marker-start="url(#cc-arrow-000)" marker-end="url(#cc-arrow-000)"');
    expect(svg).toMatch(/<text [^>]*text-anchor="middle"[^>]*>l<\/text>/);
    // Its line dragged further away; the points and the label stay.
    expect(endMoved(dimension, 3, 30, 25)).toMatchObject({ offset: 15, x1: 10, x2: 60 });
    expect(itemAt(addItem(emptyScene(), dimension), 35, 34)?.id).toBe('d1');
  });

  it('draws an arc round its centre, a moment with an arrowhead, and moves its ends', () => {
    const moment = drawn('moment', 'm1', 50, 50, 60, 50, '#c00', 0.35, 'none');
    expect(moment).toMatchObject({ type: 'arc', cx: 50, cy: 50, r: 10, start: 0, sweep: 270, arrow: true });
    const svg = sceneSvg(addItem(emptyScene(), moment));
    expect(svg).toContain('<path d="M60 50A10 10 0 1 1 50 40"');
    expect(svg).toContain('marker-end="url(#cc-arrow-c00)"');
    // The end dragged to the bottom: a quarter round, clockwise on screen.
    expect(endMoved(moment, 2, 50, 70)).toMatchObject({ sweep: 90, r: 10 });
    expect(itemAt(addItem(emptyScene(), moment), 50, 60)?.id).toBe('m1');
    expect(itemAt(addItem(emptyScene(), moment), 50, 50)).toBeUndefined();
  });

  it('hatches a section: the pattern in the colour of its outline, over the fill', () => {
    const svg = sceneSvg(addItem(emptyScene(), drawn('rect', 'r1', 0, 0, 20, 10, '#1565c0', 0.35, 'none', '', 3.5, true)));
    expect(svg).toContain('<pattern id="cc-hatch-1565c0"');
    expect(svg).toContain('fill="url(#cc-hatch-1565c0)"');
  });
});

describe('supports and loads', () => {
  it('puts a support at its point, turns it by a quarter and sizes it from a corner', () => {
    const pin = drawn('pin', 's1', 0, 0, 30, 40, '#000', 0.35, 'none');
    expect(pin).toMatchObject({ type: 'support', kind: 'pin', x: 30, y: 40, size: 6, angle: 0 });
    const svg = sceneSvg(addItem(emptyScene(), pin));
    expect(svg).toContain('<g class="cc-support cc-pin" transform="translate(30 40) rotate(0)">');
    expect(svg).toContain('<circle cx="0" cy="0"');
    expect(turned(turned(pin))).toMatchObject({ angle: 180 });
    expect(resized(pin, 'se', 40, 44)).toMatchObject({ size: 10, x: 30, y: 40 });
    expect(sceneSvg(addItem(emptyScene(), drawn('roller', 's2', 0, 0, 10, 10, '#000', 0.35, 'none')))).toContain('cc-roller');
    expect(sceneSvg(addItem(emptyScene(), drawn('fixed', 's3', 0, 0, 10, 10, '#000', 0.35, 'none')))).toContain('cc-fixed');
  });

  it('draws a load as arrows pointing at its line, joined at their tails, with its label', () => {
    const load = drawn('load', 'q1', 10, 30, 40, 30, '#000', 0.25, 'none', 'q', 3.5);
    expect(load).toMatchObject({ type: 'load', height: 6, text: 'q' });
    const svg = sceneSvg(addItem(emptyScene(), load));
    // 30 mm: an arrow every 3 mm, from y 24 down to the line at y 30.
    expect(svg.match(/marker-end="url\(#cc-arrow-000\)"/g)).toHaveLength(11);
    expect(svg).toContain('<line x1="10" y1="24" x2="10" y2="30"');
    expect(svg).toContain('<line x1="10" y1="24" x2="40" y2="24"');
    expect(svg).toMatch(/>q<\/text>/);
    expect(endMoved(load, 3, 25, 20)).toMatchObject({ height: 10 });
  });
});
