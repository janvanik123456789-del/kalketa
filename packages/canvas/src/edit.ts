/**
 * Editing a canvas scene: every operation returns a new scene, so the canvas
 * window keeps its own undo history by keeping the scenes.
 */

import { arcPoint, dimensionLine, type CanvasItem, type CanvasScene } from './scene.js';

export type Tool = 'select' | 'text' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'dimension' | 'arc' | 'moment';

/** How far beside the measured points a new dimension is drawn, in millimetres. */
export const DIMENSION_OFFSET = 6;
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const MIN_SIZE = 2;

export function snap(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

export function newId(scene: CanvasScene): string {
  let n = scene.items.length + 1;
  while (scene.items.some((i) => i.id === `i${n}`)) n++;
  return `i${n}`;
}

export function addItem(scene: CanvasScene, item: CanvasItem): CanvasScene {
  return { ...scene, items: [...scene.items, item] };
}

export function removeItem(scene: CanvasScene, id: string): CanvasScene {
  return { ...scene, items: scene.items.filter((i) => i.id !== id) };
}

export function replaceItem(scene: CanvasScene, item: CanvasItem): CanvasScene {
  return { ...scene, items: scene.items.map((i) => (i.id === item.id ? item : i)) };
}

export function findItem(scene: CanvasScene, id: string | undefined): CanvasItem | undefined {
  return id === undefined ? undefined : scene.items.find((i) => i.id === id);
}

/** Approximate box of a text: the canvas has no font metrics, a character is about 0.55 of the size wide. */
function textBox(item: Extract<CanvasItem, { type: 'text' }>): Box {
  const lines = item.text.split('\n');
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { x: item.x, y: item.y, w: longest * item.size * 0.55, h: lines.length * item.size * 1.25 };
}

export function boxOf(item: CanvasItem): Box {
  switch (item.type) {
    case 'line':
    case 'arrow':
      return { x: Math.min(item.x1, item.x2), y: Math.min(item.y1, item.y2), w: Math.abs(item.x2 - item.x1), h: Math.abs(item.y2 - item.y1) };
    case 'text':
      return textBox(item);
    case 'dimension': {
      const d = dimensionLine(item);
      const xs = [item.x1, item.x2, d.x1, d.x2];
      const ys = [item.y1, item.y2, d.y1, d.y2];
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case 'arc':
      return { x: item.cx - item.r, y: item.cy - item.r, w: 2 * item.r, h: 2 * item.r };
    default:
      return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
}

/** The item moved by (dx, dy). */
export function moved(item: CanvasItem, dx: number, dy: number): CanvasItem {
  switch (item.type) {
    case 'line':
    case 'arrow':
    case 'dimension':
      return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    case 'arc':
      return { ...item, cx: item.cx + dx, cy: item.cy + dy };
    case 'text':
      return { ...item, x: item.x + dx, y: item.y + dy };
    default:
      return { ...item, x: item.x + dx, y: item.y + dy };
  }
}

/**
 * A box dragged at one corner to (x, y), the opposite corner staying put. A
 * picture keeps its proportions; a text changes its size with the height.
 */
export function resized(item: CanvasItem, corner: Corner, x: number, y: number): CanvasItem {
  const box = boxOf(item);
  const fixedX = corner === 'nw' || corner === 'sw' ? box.x + box.w : box.x;
  const fixedY = corner === 'nw' || corner === 'ne' ? box.y + box.h : box.y;
  let w = Math.max(MIN_SIZE, Math.abs(x - fixedX));
  let h = Math.max(MIN_SIZE, Math.abs(y - fixedY));
  if (item.type === 'image' && box.w > 0 && box.h > 0) {
    // The larger change wins, the other side follows the picture's proportions.
    const ratio = box.w / box.h;
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
  }
  const left = x < fixedX ? fixedX - w : fixedX;
  const top = y < fixedY ? fixedY - h : fixedY;
  switch (item.type) {
    case 'line':
    case 'arrow':
    case 'dimension':
    case 'arc':
      return item;
    case 'text':
      return { ...item, x: left, y: top, size: Math.max(1.5, Math.round((h / (item.text.split('\n').length * 1.25)) * 10) / 10) };
    default:
      return { ...item, x: left, y: top, w, h };
  }
}

/**
 * One end of a line, an arrow or a dimension dragged to (x, y); of an arc, its start (the
 * radius goes with it) or its end. End 3 of a dimension is its line, dragged to its distance.
 */
export function endMoved(item: CanvasItem, end: 1 | 2 | 3, x: number, y: number): CanvasItem {
  if (item.type === 'arc') {
    const angle = (Math.atan2(y - item.cy, x - item.cx) * 180) / Math.PI;
    if (end === 1) return { ...item, r: Math.max(MIN_SIZE / 2, Math.hypot(x - item.cx, y - item.cy)), start: angle, sweep: item.sweep };
    // The end keeps the direction of the arc and goes round at most once.
    let sweep = angle - item.start;
    if (item.sweep >= 0) sweep = ((sweep % 360) + 360) % 360 || 360;
    else sweep = -((((-sweep) % 360) + 360) % 360 || 360);
    return { ...item, sweep };
  }
  if (item.type === 'dimension' && end === 3) {
    const d = dimensionLine(item);
    return { ...item, offset: Math.round(((x - item.x1) * d.nx + (y - item.y1) * d.ny) * 2) / 2 };
  }
  if (item.type !== 'line' && item.type !== 'arrow' && item.type !== 'dimension') return item;
  return end === 1 ? { ...item, x1: x, y1: y } : { ...item, x2: x, y2: y };
}

/** The handles of an item that has no corners: the ends of a line, a dimension (and its line), an arc. */
export function endsOf(item: CanvasItem): { end: 1 | 2 | 3; x: number; y: number }[] | undefined {
  if (item.type === 'line' || item.type === 'arrow') return [{ end: 1, x: item.x1, y: item.y1 }, { end: 2, x: item.x2, y: item.y2 }];
  if (item.type === 'dimension') {
    const d = dimensionLine(item);
    return [{ end: 1, x: item.x1, y: item.y1 }, { end: 2, x: item.x2, y: item.y2 }, { end: 3, x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 }];
  }
  if (item.type === 'arc') {
    const from = arcPoint(item, item.start);
    const to = arcPoint(item, item.start + item.sweep);
    return [{ end: 1, ...from }, { end: 2, ...to }];
  }
  return undefined;
}

/** The item in front (direction 1) or behind (-1) by one place; 'front' / 'back' to the end. */
export function reordered(scene: CanvasScene, id: string, to: 1 | -1 | 'front' | 'back'): CanvasScene {
  const items = [...scene.items];
  const index = items.findIndex((i) => i.id === id);
  if (index < 0) return scene;
  const [item] = items.splice(index, 1);
  const target = to === 'front' ? items.length : to === 'back' ? 0 : Math.max(0, Math.min(items.length, index + to));
  items.splice(target, 0, item!);
  return { ...scene, items };
}

/** The top item at (x, y), with a few millimetres of tolerance for thin lines. */
export function itemAt(scene: CanvasScene, x: number, y: number, tolerance = 1.5): CanvasItem | undefined {
  for (let i = scene.items.length - 1; i >= 0; i--) {
    const item = scene.items[i]!;
    if (item.type === 'line' || item.type === 'arrow') {
      if (distanceToSegment(x, y, item.x1, item.y1, item.x2, item.y2) <= tolerance + item.stroke.width / 2) return item;
      continue;
    }
    if (item.type === 'dimension') {
      const d = dimensionLine(item);
      const near = [
        distanceToSegment(x, y, d.x1, d.y1, d.x2, d.y2),
        distanceToSegment(x, y, item.x1, item.y1, d.x1, d.y1),
        distanceToSegment(x, y, item.x2, item.y2, d.x2, d.y2),
      ];
      // The label stands beside the line: a little more room there.
      if (Math.min(...near) <= tolerance + (near[0]! <= item.size * 1.2 ? item.size : 0)) return item;
      continue;
    }
    if (item.type === 'arc') {
      if (Math.abs(Math.hypot(x - item.cx, y - item.cy) - item.r) <= tolerance + item.stroke.width / 2) return item;
      continue;
    }
    const b = boxOf(item);
    if (x >= b.x - tolerance / 2 && x <= b.x + b.w + tolerance / 2 && y >= b.y - tolerance / 2 && y <= b.y + b.h + tolerance / 2) return item;
  }
  return undefined;
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * A new shape drawn from (x1, y1) to (x2, y2) with the given tool. A dimension measures
 * between the two points; an arc goes round the first point through the second, a quarter
 * of a circle, a moment three quarters with an arrowhead.
 */
export function drawn(tool: Exclude<Tool, 'select' | 'text'>, id: string, x1: number, y1: number, x2: number, y2: number, colour: string, width: number, fill: string, label = '', size = 3.5, hatch = false): CanvasItem {
  const stroke = { color: colour, width };
  if (tool === 'line' || tool === 'arrow') return { id, type: tool, x1, y1, x2, y2, stroke };
  if (tool === 'dimension') return { id, type: 'dimension', x1, y1, x2, y2, offset: DIMENSION_OFFSET, text: label, size, stroke };
  if (tool === 'arc' || tool === 'moment') {
    const start = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return { id, type: 'arc', cx: x1, cy: y1, r: Math.max(MIN_SIZE / 2, Math.hypot(x2 - x1, y2 - y1)), start, sweep: tool === 'moment' ? 270 : 90, ...(tool === 'moment' ? { arrow: true } : {}), stroke };
  }
  if (hatch) return { id, type: tool, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(MIN_SIZE, Math.abs(x2 - x1)), h: Math.max(MIN_SIZE, Math.abs(y2 - y1)), stroke, fill, hatch: true };
  return { id, type: tool, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(MIN_SIZE, Math.abs(x2 - x1)), h: Math.max(MIN_SIZE, Math.abs(y2 - y1)), stroke, fill };
}
