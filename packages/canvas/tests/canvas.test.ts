import { describe, expect, it } from 'vitest';
import { addItem, beamSketch, drawn, drivenScene, sectionSketch, itemsIn, liveNames, turned, emptyScene, endMoved, itemAt, migrate, moved, newId, readScene, reordered, resized, sceneSvg, writeScene, type CanvasItem } from '../src/index.js';
import { htmlOf, runsOf, type RichNode } from '../src/editor/richText.js';

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

describe('texts written as in a word processor, values of the calculation, choosing by a frame', () => {
  it('draws runs of a text in their formats, the font and the alignment of the whole', () => {
    const text: CanvasItem = {
      id: 't1', type: 'text', x: 10, y: 10, text: 'Síla F\nna konci', size: 4, color: '#000', font: 'serif', align: 'center',
      runs: [[{ text: 'Síla ' }, { text: 'F', bold: true, italic: true, color: '#c62828' }], [{ text: 'na konci', underline: true }]],
    };
    const svg = sceneSvg(addItem(emptyScene(), text));
    expect(svg).toContain('font-family="Cambria, Times New Roman, serif"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('<tspan font-weight="bold" font-style="italic" fill="#c62828">F</tspan>');
    expect(svg).toContain('<tspan text-decoration="underline">na konci</tspan>');
  });

  it('shows {names} with the values the host gives, and keeps a name without one', () => {
    const scene = addItem(addItem(emptyScene(), { id: 't1', type: 'text', x: 0, y: 0, text: 'L = {L}, {x}', size: 3.5, color: '#000' }), drawn('dimension', 'd1', 0, 20, 30, 20, '#000', 0.25, 'none', '{L}'));
    expect(liveNames(scene)).toEqual(['L', 'x']);
    const svg = sceneSvg(scene, undefined, (name) => (name === 'L' ? '5 m' : undefined));
    expect(svg).toContain('L = 5 m, {x}');
    expect(svg).toMatch(/>5 m<\/text>/);
  });

  it('reads a field written in back as runs: blocks and breaks as lines, tags and styles as formats', () => {
    const el = (name: string, children: RichNode[], extra: Partial<RichNode> = {}): RichNode => ({ nodeType: 1, nodeName: name, textContent: null, childNodes: children, ...extra });
    const txt = (text: string): RichNode => ({ nodeType: 3, nodeName: '#text', textContent: text, childNodes: [] });
    const root = el('DIV', [txt('Síla '), el('B', [txt('F')]), el('DIV', [el('FONT', [txt('na konci')], { getAttribute: () => '#c62828' })]), el('DIV', [el('BR', [])]), el('DIV', [el('SPAN', [txt('x')], { style: { textDecorationLine: 'underline' } })])]);
    expect(runsOf(root)).toEqual([[{ text: 'Síla ' }, { text: 'F', bold: true }], [{ text: 'na konci', color: '#c62828' }], [], [{ text: 'x', underline: true }]]);
    expect(htmlOf([[{ text: 'a' }, { text: 'b', bold: true }], []])).toBe('<div>a<b>b</b></div><div><br></div>');
  });

  it('chooses by a frame what it catches, a force with its label, a hinge', () => {
    const scene = addItem(addItem(emptyScene(), rect), drawn('force', 'f1', 50, 10, 50, 30, '#000', 0.35, 'none', 'F', 3.5));
    expect(itemsIn(scene, 0, 0, 25, 15)).toEqual(['i1']);
    expect(itemsIn(scene, 0, 0, 100, 100)).toEqual(['i1', 'f1']);
    expect(sceneSvg(scene)).toMatch(/<g class="cc-force">.*>F<\/text><\/g>/);
    expect(sceneSvg(addItem(emptyScene(), drawn('hinge', 'h1', 0, 0, 5, 5, '#000', 0.35, 'none')))).toContain('cc-hinge');
  });
});

describe('a drawing driven by the calculation', () => {
  const stroke = { color: '#000', width: 0.35 };
  const dimension = (id: string, x1: number, y1: number, x2: number, y2: number, text: string): CanvasItem => ({ id, type: 'dimension', x1, y1, x2, y2, offset: 5, text, size: 3, stroke, driving: true });
  const line = (id: string, x1: number, y1: number, x2: number, y2: number): CanvasItem => ({ id, type: 'line', x1, y1, x2, y2, stroke });
  const lengths = (given: Record<string, number | 'other'>) => (name: string) => given[name];
  const item = (scene: { items: readonly CanvasItem[] }, id: string) => scene.items.find((i) => i.id === id) as unknown as { x1: number; y1: number; x2: number; y2: number };

  it('gives a stretch its length and all points follow, in the proportion of the sketch', () => {
    const scene = { ...emptyScene(200, 100), scale: 20, items: [dimension('d', 10, 50, 110, 50, '{L}'), line('l', 10, 50, 110, 50), line('m', 60, 40, 60, 60), line('out', 120, 50, 130, 50)] };
    const { scene: shown, notes } = drivenScene(scene, lengths({ L: 6 }));
    expect(notes).toEqual([]);
    expect(item(shown, 'l').x2 - item(shown, 'l').x1).toBeCloseTo(120, 9);
    expect(item(shown, 'm').x1).toBeCloseTo(70, 9);
    // A point past the stretch moves with its end, at its distance.
    expect(item(shown, 'out').x1).toBeCloseTo(140, 9);
    expect(item(shown, 'out').x2).toBeCloseTo(150, 9);
    // Nothing happens across: y stays.
    expect(item(shown, 'm').y1).toBe(40);
  });

  it('a dimension in a dimension: the numbers of the proposal', () => {
    const at = (L: number, a: number, scale: number) => {
      const scene = { ...emptyScene(200, 100), scale, items: [dimension('L', 20, 50, 120, 50, '{L}'), dimension('a', 20, 40, 60, 40, '{a}'), line('f', 60, 30, 60, 50)] };
      return item(drivenScene(scene, lengths({ L, a })).scene, 'f').x1 - 20;
    };
    expect(at(6, 2.5, 20)).toBeCloseTo(50, 9);
    expect(at(12, 2.5, 10)).toBeCloseTo(25, 9);
  });

  it('fits the sketch by itself, and the same scale holds on both axes', () => {
    const scene = { ...emptyScene(200, 100), items: [dimension('L', 10, 80, 110, 80, '{L}'), dimension('h', 150, 10, 150, 60, '{h}'), line('v', 150, 10, 150, 60)] };
    const shown = drivenScene(scene, lengths({ L: 10, h: 2 })).scene;
    // 100 mm for 10 m is 10 mm/m; 50 mm for 2 m would be 25, the smaller one holds.
    expect(item(shown, 'v').y2 - item(shown, 'v').y1).toBeCloseTo(20, 9);
    // Again gives the same: the drawing saved as the new sketch does not jump.
    const again = drivenScene(shown, lengths({ L: 10, h: 2 })).scene;
    expect(item(again, 'v').y2).toBeCloseTo(item(shown, 'v').y2, 9);
  });

  it('keeps sizes of marks and lettering, moves their place', () => {
    const scene = { ...emptyScene(200, 100), scale: 10, items: [dimension('L', 10, 50, 110, 50, '{L}'), { id: 's', type: 'support', kind: 'pin', x: 110, y: 50, size: 6, angle: 0, stroke } as CanvasItem] };
    const s = drivenScene(scene, lengths({ L: 5 })).scene.items[1] as Extract<CanvasItem, { type: 'support' }>;
    expect([s.x, s.size]).toEqual([60, 6]);
  });

  it.each([
    ['unknown', '{X}', {}],
    ['not-positive', '{L}', { L: 0 }],
    ['not-positive', '{L}', { L: -2 }],
    ['not-length', '{F}', { F: 'other' as const }],
    ['no-name', 'L = 5', {}],
  ])('stays as sketched with a note: %s %s', (kind, label, given) => {
    const scene = { ...emptyScene(200, 100), items: [dimension('d', 10, 50, 110, 50, label), line('l', 10, 50, 110, 50)] };
    const { scene: shown, notes } = drivenScene(scene, lengths(given as Record<string, number>));
    expect(notes.map((n) => n.kind)).toEqual([kind]);
    expect(item(shown, 'l').x2).toBe(110);
  });

  it('what does not fit or crosses is not used, the rest holds', () => {
    const inner = { ...emptyScene(200, 100), scale: 10, items: [dimension('L', 10, 50, 110, 50, '{L}'), dimension('a', 10, 40, 50, 40, '{a}'), line('l', 10, 50, 110, 50)] };
    const r = drivenScene(inner, lengths({ L: 5, a: 7 }));
    expect(r.notes).toEqual([{ kind: 'does-not-fit', name: 'a' }]);
    expect(item(r.scene, 'l').x2 - item(r.scene, 'l').x1).toBeCloseTo(50, 9);
    const crossing = { ...emptyScene(200, 100), items: [dimension('p', 10, 50, 60, 50, '{p}'), dimension('q', 40, 40, 90, 40, '{q}'), line('l', 10, 50, 90, 50)] };
    const c = drivenScene(crossing, lengths({ p: 1, q: 1 }));
    expect(c.notes.map((n) => n.kind)).toEqual(['crossing', 'crossing']);
    expect(item(c.scene, 'l').x2).toBe(90);
  });

  it('says when a scale does not fit the canvas', () => {
    const scene = { ...emptyScene(100, 50), scale: 100, items: [dimension('L', 10, 25, 90, 25, '{L}')] };
    expect(drivenScene(scene, lengths({ L: 6 })).notes).toEqual([{ kind: 'over-canvas' }]);
  });

  it('is drawn so in the SVG, and only with a host that gives lengths', () => {
    const scene = { ...emptyScene(200, 100), scale: 10, items: [dimension('L', 10, 50, 110, 50, '{L}'), line('l', 10, 50, 110, 50)] };
    const values = Object.assign((name: string) => (name === 'L' ? '5 m' : undefined), { lengthOf: lengths({ L: 5 }) });
    expect(sceneSvg(scene, undefined, values)).toContain('x2="60"');
    expect(sceneSvg(scene, undefined, (name) => (name === 'L' ? '5 m' : undefined))).toContain('x2="110"');
  });

  it('survives saving; an older file has no such fields', () => {
    const scene = { ...emptyScene(200, 100), scale: 20, items: [dimension('L', 10, 50, 110, 50, '{L}')] };
    const read = readScene(writeScene(scene));
    expect(read.scale).toBe(20);
    expect((read.items[0] as Extract<CanvasItem, { type: 'dimension' }>).driving).toBe(true);
    expect(readScene(writeScene(emptyScene())).scale).toBeUndefined();
  });

  it('the ready sketches follow: a beam, and a section in scale', () => {
    const beam = drivenScene(beamSketch('L', 'q'), lengths({ L: 8 }));
    expect(beam.notes).toEqual([]);
    const roller = beam.scene.items.find((i) => i.type === 'support' && i.kind === 'roller') as Extract<CanvasItem, { type: 'support' }>;
    expect(roller.x).toBeCloseTo(120, 9);
    const names = { h: 'h', b: 'b', t_w: 't_w', t_f: 't_f' };
    const ipe = drivenScene({ ...sectionSketch(names), scale: 200 }, lengths({ h: 0.3, b: 0.15, t_w: 0.0071, t_f: 0.0107 }));
    expect(ipe.notes).toEqual([]);
    const web = ipe.scene.items.find((i) => i.id === 's2') as unknown as { w: number; h: number };
    const top = ipe.scene.items.find((i) => i.id === 's1') as unknown as { w: number; h: number };
    expect(top.w).toBeCloseTo(0.15 * 200, 6);
    expect(web.w).toBeCloseTo(0.0071 * 200, 6);
    expect(top.h).toBeCloseTo(0.0107 * 200, 6);
  });
});
