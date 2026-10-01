import { describe, expect, it } from 'vitest';
import { emptyScene, readScene, sceneSvg, writeScene, type CanvasItem } from '@calccanvas/render';
import { addItem, drawn, endMoved, itemAt, moved, newId, reordered, resized } from '../src/logic/canvasEdit.js';

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
