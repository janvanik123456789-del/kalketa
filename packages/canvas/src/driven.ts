/**
 * A drawing that follows the calculation (docs/navrhy/KRESBA-VAZANA-NA-VYPOCET.md). A dimension marked as driving and
 * labelled {L} gets the length of L: every horizontal one is a stretch of the x axis, every vertical one of the y axis.
 * The values on an axis move so the stretches have their lengths, and all points of all items go through the same map.
 * The map only ever grows, so there is nothing to solve and the result is unique; marks and lettering keep their size,
 * as only the point where they stand moves. A drawing never falls apart and never touches the calculation: what cannot
 * be followed stays as sketched, with a note.
 */

import type { CanvasItem, CanvasScene } from './scene.js';

/** The length of a name in metres; 'other' for a value of another kind, undefined for no value. */
export type LengthOf = (name: string) => number | 'other' | undefined;

export interface DrivenNote {
  readonly kind: 'no-name' | 'unknown' | 'not-length' | 'not-positive' | 'not-axis' | 'crossing' | 'does-not-fit' | 'over-canvas';
  readonly name?: string;
}

export interface DrivenResult {
  readonly scene: CanvasScene;
  readonly notes: readonly DrivenNote[];
}

/** Millimetres of the drawing per metre of the structure, for the scales offered: 1:10 is 100. */
export const DRAWING_SCALES: readonly number[] = [100, 50, 20, 10];

const NAME = /\{([\p{L}_][\p{L}\p{N}_]*)\}/u;
const TINY = 1e-6;

interface Stretch {
  readonly a: number;
  readonly b: number;
  readonly metres: number;
  readonly name: string;
  readonly inner: Stretch[];
}

type Point = readonly [number, number];

export function drivenScene(scene: CanvasScene, lengthOf: LengthOf | undefined): DrivenResult {
  const driving = scene.items.filter((i): i is Extract<CanvasItem, { type: 'dimension' }> => i.type === 'dimension' && !!i.driving);
  if (!lengthOf || driving.length === 0) return { scene, notes: [] };
  const notes: DrivenNote[] = [];
  const x: Stretch[] = [];
  const y: Stretch[] = [];
  for (const item of driving) {
    const name = NAME.exec(item.text)?.[1];
    if (!name) {
      notes.push({ kind: 'no-name' });
      continue;
    }
    const value = lengthOf(name);
    if (value === undefined) notes.push({ kind: 'unknown', name });
    else if (value === 'other') notes.push({ kind: 'not-length', name });
    else if (!(value > 0)) notes.push({ kind: 'not-positive', name });
    else if (Math.abs(item.y1 - item.y2) < TINY && Math.abs(item.x1 - item.x2) > TINY) x.push({ a: Math.min(item.x1, item.x2), b: Math.max(item.x1, item.x2), metres: value, name, inner: [] });
    else if (Math.abs(item.x1 - item.x2) < TINY && Math.abs(item.y1 - item.y2) > TINY) y.push({ a: Math.min(item.y1, item.y2), b: Math.max(item.y1, item.y2), metres: value, name, inner: [] });
    else notes.push({ kind: 'not-axis', name });
  }
  const topsX = nested(x, notes);
  const topsY = nested(y, notes);
  if (topsX.length === 0 && topsY.length === 0) return { scene, notes };
  const scale = scene.scale ?? Math.min(fitOf(topsX), fitOf(topsY));
  const mapX = axisMap(topsX, scale, notes);
  const mapY = axisMap(topsY, scale, notes);
  const items = scene.items.map((item) => movedBy(item, mapX, mapY));
  const shown: CanvasScene = { ...scene, items };
  if (scene.scale !== undefined && overCanvas(shown)) notes.push({ kind: 'over-canvas' });
  return { scene: shown, notes };
}

/** The scale that keeps a drawn stretch as long as it was sketched. */
function fitOf(tops: readonly Stretch[]): number {
  if (tops.length === 0) return Infinity;
  return tops.reduce((sum, s) => sum + (s.b - s.a), 0) / tops.reduce((sum, s) => sum + s.metres, 0);
}

/** Stretches as a tree: one inside another, or apart. Two that cross say nothing certain, and both go. */
function nested(all: readonly Stretch[], notes: DrivenNote[]): Stretch[] {
  const crosses = (p: Stretch, q: Stretch) => p !== q && p.a < q.b - TINY && q.a < p.b - TINY && !(p.a <= q.a + TINY && q.b <= p.b + TINY) && !(q.a <= p.a + TINY && p.b <= q.b + TINY);
  const same = (p: Stretch, q: Stretch) => p !== q && Math.abs(p.a - q.a) < TINY && Math.abs(p.b - q.b) < TINY;
  const bad = all.filter((p) => all.some((q) => crosses(p, q) || (same(p, q) && Math.abs(p.metres - q.metres) > TINY * p.metres)));
  for (const s of bad) notes.push({ kind: 'crossing', name: s.name });
  const kept = all.filter((s, i) => !bad.includes(s) && !all.slice(0, i).some((q) => same(s, q)));
  const sorted = [...kept].sort((p, q) => p.a - q.a || q.b - p.b);
  const tops: Stretch[] = [];
  const open: Stretch[] = [];
  for (const s of sorted) {
    while (open.length > 0 && open[open.length - 1]!.b <= s.a + TINY) open.pop();
    const holder = open[open.length - 1];
    (holder ? holder.inner : tops).push(s);
    open.push(s);
  }
  return tops;
}

/** The map of one axis: points of a stretch where its children and the free parts between them go. */
function axisMap(tops: readonly Stretch[], scale: number, notes: DrivenNote[]): (x: number) => number {
  if (tops.length === 0) return (x) => x;
  const points: Point[] = [];
  const place = (s: Stretch, start: number): number => {
    const total = s.metres * scale;
    points.push([s.a, start]);
    const inner = s.inner;
    const taken = inner.reduce((sum, c) => sum + c.metres * scale, 0);
    let free = s.b - s.a;
    for (const c of inner) free -= c.b - c.a;
    const rest = total - taken;
    // The inner ones do not fit in the outer one, or nothing is left to take up a difference: only the outer one holds.
    const fits = inner.length > 0 && (free > TINY ? rest > TINY : Math.abs(rest) <= 1e-6 * total);
    if (inner.length > 0 && !fits) for (const c of inner) notes.push({ kind: 'does-not-fit', name: c.name });
    if (fits) {
      const k = free > TINY ? rest / free : 0;
      let from = s.a;
      let at = start;
      for (const c of inner) {
        at += (c.a - from) * k;
        at = place(c, at);
        from = c.b;
      }
    }
    points.push([s.b, start + total]);
    return start + total;
  };
  let at = tops[0]!.a;
  let from = tops[0]!.a;
  for (const s of tops) {
    at += s.a - from;
    at = place(s, at);
    from = s.b;
  }
  points.sort((p, q) => p[0] - q[0]);
  return (x) => {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (x <= first[0]) return x + first[1] - first[0];
    if (x >= last[0]) return x + last[1] - last[0];
    let i = 1;
    while (points[i]![0] < x) i++;
    const [p, q] = [points[i - 1]!, points[i]!];
    const width = q[0] - p[0];
    return width > 0 ? p[1] + ((x - p[0]) / width) * (q[1] - p[1]) : q[1];
  };
}

function movedBy(item: CanvasItem, mx: (x: number) => number, my: (y: number) => number): CanvasItem {
  switch (item.type) {
    case 'rect':
    case 'ellipse':
    case 'image': {
      const [x, y] = [mx(item.x), my(item.y)];
      return { ...item, x, y, w: mx(item.x + item.w) - x, h: my(item.y + item.h) - y };
    }
    case 'line':
    case 'arrow':
    case 'dimension':
    case 'load':
      return { ...item, x1: mx(item.x1), y1: my(item.y1), x2: mx(item.x2), y2: my(item.y2) };
    case 'arc':
      return { ...item, cx: mx(item.cx), cy: my(item.cy) };
    case 'text':
    case 'support':
      return { ...item, x: mx(item.x), y: my(item.y) };
  }
}

function overCanvas(scene: CanvasScene): boolean {
  const out = (x: number, y: number) => x < -TINY || y < -TINY || x > scene.width + TINY || y > scene.height + TINY;
  return scene.items.some((i) => {
    if (i.type === 'rect' || i.type === 'ellipse' || i.type === 'image') return out(i.x, i.y) || out(i.x + i.w, i.y + i.h);
    if (i.type === 'line' || i.type === 'arrow' || i.type === 'dimension' || i.type === 'load') return out(i.x1, i.y1) || out(i.x2, i.y2);
    if (i.type === 'support' || i.type === 'text') return out(i.x, i.y);
    return false;
  });
}

const STROKE = { color: '#000000', width: 0.35 };

/** A beam on two supports under a load, its length driven by a name of the sheet. */
export function beamSketch(length: string, load: string | undefined): CanvasScene {
  const items: CanvasItem[] = [
    { id: 'b1', type: 'line', x1: 20, y1: 40, x2: 120, y2: 40, stroke: { ...STROKE, width: 0.7 } },
    { id: 'b2', type: 'support', kind: 'pin', x: 20, y: 40, size: 6, angle: 0, stroke: STROKE },
    { id: 'b3', type: 'support', kind: 'roller', x: 120, y: 40, size: 6, angle: 0, stroke: STROKE },
    { id: 'b4', type: 'dimension', x1: 20, y1: 40, x2: 120, y2: 40, offset: -14, text: `{${length}}`, size: 3.5, stroke: STROKE, driving: true },
  ];
  if (load) items.splice(1, 0, { id: 'b5', type: 'load', x1: 20, y1: 40, x2: 120, y2: 40, height: 10, text: `{${load}}`, size: 3.5, stroke: STROKE });
  return { version: 1, width: 140, height: 70, items };
}

/** An I section in scale, its sizes driven by names of the sheet: h, b, t_w and t_f. */
export function sectionSketch(names: { readonly h: string; readonly b: string; readonly t_w: string; readonly t_f: string }): CanvasScene {
  const fill = { stroke: STROKE, fill: '#00000033' };
  const items: CanvasItem[] = [
    { id: 's1', type: 'rect', x: 40, y: 15, w: 40, h: 8, ...fill },
    { id: 's2', type: 'rect', x: 57, y: 23, w: 6, h: 44, ...fill },
    { id: 's3', type: 'rect', x: 40, y: 67, w: 40, h: 8, ...fill },
    { id: 's4', type: 'dimension', x1: 40, y1: 15, x2: 80, y2: 15, offset: 7, text: `{${names.b}}`, size: 3, stroke: STROKE, driving: true },
    { id: 's5', type: 'dimension', x1: 90, y1: 15, x2: 90, y2: 75, offset: -6, text: `{${names.h}}`, size: 3, stroke: STROKE, driving: true },
    { id: 's6', type: 'dimension', x1: 57, y1: 80, x2: 63, y2: 80, offset: -5, text: `{${names.t_w}}`, size: 3, stroke: STROKE, driving: true },
    { id: 's7', type: 'dimension', x1: 30, y1: 15, x2: 30, y2: 23, offset: 5, text: `{${names.t_f}}`, size: 3, stroke: STROKE, driving: true },
  ];
  return { version: 1, width: 110, height: 90, items };
}
