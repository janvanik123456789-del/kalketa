/**
 * Canvas: a drawing with shapes, text and pictures placed freely, stored in
 * the calculation file as canvases/<name>.json and shown in the sheet like a
 * picture (![caption](canvases/<name>.json)). Coordinates are millimetres;
 * the drawing is drawn as SVG, sharp at any zoom and in PDF.
 */

/** Version of the scene format; older scenes are brought up to it when read (migrate). */
export const CANVAS_VERSION = 1;

export interface Stroke {
  /** CSS colour; 'none' for no outline. */
  readonly color: string;
  /** Line width in millimetres. */
  readonly width: number;
}

interface ItemBase {
  readonly id: string;
}

export type CanvasItem =
  | (ItemBase & { readonly type: 'rect' | 'ellipse'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly stroke: Stroke; readonly fill: string; /** Hatched, as a section or the ground is drawn. */ readonly hatch?: boolean })
  | (ItemBase & { readonly type: 'line' | 'arrow'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: Stroke })
  | (ItemBase & { readonly type: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly size: number; readonly color: string; readonly bold?: boolean })
  | (ItemBase & { readonly type: 'image'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly src: string })
  /**
   * A dimension: the length between two points, drawn at `offset` beside them (along the
   * normal of the direction from point 1 to 2, turned to the left), with its label (l, 150, Δl).
   */
  | (ItemBase & { readonly type: 'dimension'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly offset: number; readonly text: string; readonly size: number; readonly stroke: Stroke })
  /**
   * An arc around (cx, cy): from the angle `start` by `sweep` degrees (on screen, clockwise
   * from the right), with an arrowhead at its end for a moment or a rotation.
   */
  | (ItemBase & { readonly type: 'arc'; readonly cx: number; readonly cy: number; readonly r: number; readonly start: number; readonly sweep: number; readonly arrow?: boolean; readonly stroke: Stroke })
  /**
   * A support at the point (x, y) where it holds the structure: a pin (fixed hinge), a
   * roller (moves along the ground), a fixed end (a wall). Turned by `angle` degrees
   * (0: a pin or roller below the point, the wall of a fixed end on its left); `size` its height.
   */
  | (ItemBase & { readonly type: 'support'; readonly kind: SupportKind; readonly x: number; readonly y: number; readonly size: number; readonly angle: number; readonly stroke: Stroke })
  /**
   * A distributed load on the line from point 1 to 2: arrows `height` long pointing at the
   * line from its left side (as a dimension stands), joined at their tails, with its label (q).
   */
  | (ItemBase & { readonly type: 'load'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly height: number; readonly text: string; readonly size: number; readonly stroke: Stroke });

export type SupportKind = 'pin' | 'roller' | 'fixed';

export interface CanvasScene {
  readonly version: number;
  /** Size of the drawing in millimetres. */
  readonly width: number;
  readonly height: number;
  /** Bottom to top: later items are drawn over earlier ones. */
  readonly items: readonly CanvasItem[];
}

export function isCanvasPath(path: string): boolean {
  return /^canvases\/[^/]+\.json$/.test(path);
}

export function emptyScene(width = 160, height = 90): CanvasScene {
  return { version: CANVAS_VERSION, width, height, items: [] };
}

/** A scene from the bytes of its file; a damaged file gives an empty scene of the default size. */
export function readScene(bytes: Uint8Array | undefined): CanvasScene {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CanvasScene>;
    if (typeof value.width !== 'number' || typeof value.height !== 'number' || !Array.isArray(value.items)) return emptyScene();
    return migrate({ version: typeof value.version === 'number' ? value.version : 1, width: value.width, height: value.height, items: value.items });
  } catch {
    return emptyScene();
  }
}

/**
 * Brings a scene of an older format version up to the current one. Each new
 * version adds a step here, so files saved by older versions keep working.
 * A scene from a newer version is kept as it is; items this version does not
 * know are not drawn.
 */
export function migrate(scene: CanvasScene): CanvasScene {
  // Version 1 is the first one: nothing to bring up yet.
  return scene.version > CANVAS_VERSION ? scene : { ...scene, version: CANVAS_VERSION };
}

export function writeScene(scene: CanvasScene): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(scene, null, 1));
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (value: number) => String(Math.round(value * 100) / 100);

/** Pictures inside the canvas resolve through `resolveFile` (e.g. to data: URIs). */
export function sceneSvg(scene: CanvasScene, resolveFile: (path: string) => string | undefined = () => undefined): string {
  const body = sceneBody(scene, resolveFile);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(scene.width)}mm" height="${n(scene.height)}mm" viewBox="0 0 ${n(scene.width)} ${n(scene.height)}">${body}</svg>`;
}

/** The inside of the drawing (markers and items), for an editor that draws its own <svg>. */
export function sceneBody(scene: CanvasScene, resolveFile: (path: string) => string | undefined = () => undefined): string {
  return arrowDefs(scene) + scene.items.map((item) => itemSvg(item, resolveFile)).join('');
}

/** An arrowhead per colour of the arrows, dimensions and arcs (markers take no colour from their line everywhere); a hatch per colour. */
function arrowDefs(scene: CanvasScene): string {
  const pointed = (i: CanvasItem) => i.type === 'arrow' || i.type === 'dimension' || i.type === 'load' || (i.type === 'arc' && i.arrow);
  const colours = [...new Set(scene.items.flatMap((i) => (pointed(i) && 'stroke' in i ? [i.stroke.color] : [])))];
  const hatches = [...new Set(scene.items.flatMap((i) => ((i.type === 'rect' || i.type === 'ellipse') && i.hatch ? [i.stroke.color] : [])))];
  if (colours.length === 0 && hatches.length === 0) return '';
  const markers = colours.map(
    (c) => `<marker id="${arrowId(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0L10 5L0 10z" fill="${esc(c)}"/></marker>`,
  );
  // Lines at 45° every 1.5 mm, as a section is hatched.
  const patterns = hatches.map(
    (c) => `<pattern id="${hatchId(c)}" width="1.5" height="1.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.5" stroke="${esc(c)}" stroke-width="0.18"/></pattern>`,
  );
  return `<defs>${markers.join('')}${patterns.join('')}</defs>`;
}

const arrowId = (colour: string) => `cc-arrow-${colour.replace(/[^a-zA-Z0-9]/g, '')}`;
const hatchId = (colour: string) => `cc-hatch-${colour.replace(/[^a-zA-Z0-9]/g, '')}`;

/** How far the extension lines of a dimension reach past its line, in millimetres. */
const OVERSHOOT = 1.5;

/** The line of a dimension: its two ends, beside the measured points by the offset. */
export function dimensionLine(item: Extract<CanvasItem, { type: 'dimension' }>): { x1: number; y1: number; x2: number; y2: number; nx: number; ny: number } {
  const length = Math.hypot(item.x2 - item.x1, item.y2 - item.y1) || 1;
  // The normal turned to the left of the direction: up for a dimension drawn from left to right.
  const nx = (item.y2 - item.y1) / length;
  const ny = -(item.x2 - item.x1) / length;
  return { x1: item.x1 + nx * item.offset, y1: item.y1 + ny * item.offset, x2: item.x2 + nx * item.offset, y2: item.y2 + ny * item.offset, nx, ny };
}

/** The left normal of the direction from point 1 to 2 (up for left to right), as a dimension and a load use it. */
function normal(x1: number, y1: number, x2: number, y2: number): { nx: number; ny: number } {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  return { nx: (y2 - y1) / length, ny: -(x2 - x1) / length };
}

/** The line of the tails of a load: its two ends, `height` beside the loaded line. */
export function loadTop(item: Extract<CanvasItem, { type: 'load' }>): { x1: number; y1: number; x2: number; y2: number; nx: number; ny: number } {
  const { nx, ny } = normal(item.x1, item.y1, item.x2, item.y2);
  return { x1: item.x1 + nx * item.height, y1: item.y1 + ny * item.height, x2: item.x2 + nx * item.height, y2: item.y2 + ny * item.height, nx, ny };
}

/** Short strokes of the ground under a line from (x1, y) to (x2, y), as a support is drawn. */
function ground(x1: number, x2: number, y: number, s: number, line: string): string {
  const strokes: string[] = [`<line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" ${line}/>`];
  const step = s / 5;
  for (let x = x1 + step; x <= x2 + 1e-9; x += step) strokes.push(`<line x1="${n(x)}" y1="${n(y)}" x2="${n(x - step)}" y2="${n(y + step)}" ${line}/>`);
  return strokes.join('');
}

/** A support drawn around its point at the origin, before it is turned and moved. */
function supportShape(kind: SupportKind, s: number, line: string): string {
  const half = s * 0.45;
  if (kind === 'fixed') {
    // The wall: a line through the point, its hatch on the far side.
    const strokes: string[] = [`<line x1="0" y1="${n(-s * 0.75)}" x2="0" y2="${n(s * 0.75)}" ${line}/>`];
    const step = s / 5;
    for (let y = -s * 0.75 + step; y <= s * 0.75 + 1e-9; y += step) strokes.push(`<line x1="0" y1="${n(y)}" x2="${n(-step)}" y2="${n(y - step)}" ${line}/>`);
    return strokes.join('');
  }
  const base = kind === 'pin' ? s * 0.8 : s * 0.62;
  const triangle = `<path d="M0 0L${n(-half)} ${n(base)}L${n(half)} ${n(base)}Z" fill="#fff" ${line}/>`;
  const hinge = `<circle cx="0" cy="0" r="${n(s * 0.09)}" fill="#fff" ${line}/>`;
  if (kind === 'pin') return triangle + ground(-s * 0.7, s * 0.7, base, s, line) + hinge;
  // The roller: its wheels under the triangle, the ground under them.
  const wheel = s * 0.08;
  const wheels = [-half / 2, half / 2].map((x) => `<circle cx="${n(x)}" cy="${n(base + wheel)}" r="${n(wheel)}" fill="#fff" ${line}/>`).join('');
  return triangle + wheels + ground(-s * 0.7, s * 0.7, base + 2 * wheel, s, line) + hinge;
}

/** A point of an arc at an angle (degrees, clockwise from the right on screen). */
export function arcPoint(item: Extract<CanvasItem, { type: 'arc' }>, angle: number): { x: number; y: number } {
  const a = (angle * Math.PI) / 180;
  return { x: item.cx + item.r * Math.cos(a), y: item.cy + item.r * Math.sin(a) };
}

export function itemSvg(item: CanvasItem, resolveFile: (path: string) => string | undefined): string {
  const stroke = (s: Stroke) => `stroke="${esc(s.color)}" stroke-width="${n(s.width)}"`;
  switch (item.type) {
    case 'rect':
    case 'ellipse': {
      const shape = (fill: string, outline: string) =>
        item.type === 'rect'
          ? `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" fill="${fill}" ${outline}/>`
          : `<ellipse cx="${n(item.x + item.w / 2)}" cy="${n(item.y + item.h / 2)}" rx="${n(item.w / 2)}" ry="${n(item.h / 2)}" fill="${fill}" ${outline}/>`;
      // The hatch over the fill, the outline on top.
      return item.hatch ? shape(esc(item.fill), 'stroke="none"') + shape(`url(#${hatchId(item.stroke.color)})`, stroke(item.stroke)) : shape(esc(item.fill), stroke(item.stroke));
    }
    case 'dimension': {
      const d = dimensionLine(item);
      const colour = esc(item.stroke.color);
      const thin = `stroke="${colour}" stroke-width="${n(Math.min(item.stroke.width, 0.25))}"`;
      const reach = item.offset >= 0 ? OVERSHOOT : -OVERSHOOT;
      const extension = (x: number, y: number, ex: number, ey: number) => `<line x1="${n(x)}" y1="${n(y)}" x2="${n(ex + d.nx * reach)}" y2="${n(ey + d.ny * reach)}" ${thin}/>`;
      // The label over the middle of the line, turned with it and never upside down.
      let angle = (Math.atan2(d.y2 - d.y1, d.x2 - d.x1) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
      const side = item.offset >= 0 ? 1 : -1;
      // Its middle half a letter away from the line, on the side away from the measured points.
      const away = 0.6 + item.size / 2;
      const mx = (d.x1 + d.x2) / 2 + d.nx * side * away;
      const my = (d.y1 + d.y2) / 2 + d.ny * side * away;
      return (
        `<g class="cc-dimension">` +
        extension(item.x1, item.y1, d.x1, d.y1) +
        extension(item.x2, item.y2, d.x2, d.y2) +
        `<line x1="${n(d.x1)}" y1="${n(d.y1)}" x2="${n(d.x2)}" y2="${n(d.y2)}" ${stroke(item.stroke)} marker-start="url(#${arrowId(item.stroke.color)})" marker-end="url(#${arrowId(item.stroke.color)})"/>` +
        `<text x="${n(mx)}" y="${n(my)}" font-size="${n(item.size)}" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${colour}" text-anchor="middle" dominant-baseline="central" transform="rotate(${n(angle)} ${n(mx)} ${n(my)})">${esc(item.text)}</text>` +
        `</g>`
      );
    }
    case 'support': {
      const line = `stroke="${esc(item.stroke.color)}" stroke-width="${n(item.stroke.width)}" stroke-linejoin="round"`;
      return `<g class="cc-support cc-${item.kind}" transform="translate(${n(item.x)} ${n(item.y)}) rotate(${n(item.angle)})">${supportShape(item.kind, item.size, line)}</g>`;
    }
    case 'load': {
      const top = loadTop(item);
      const length = Math.hypot(item.x2 - item.x1, item.y2 - item.y1);
      // An arrow every 3 mm or so, one at each end.
      const count = Math.max(2, Math.round(length / 3) + 1);
      const arrows = Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        const bx = item.x1 + (item.x2 - item.x1) * t;
        const by = item.y1 + (item.y2 - item.y1) * t;
        return `<line x1="${n(bx + top.nx * item.height)}" y1="${n(by + top.ny * item.height)}" x2="${n(bx)}" y2="${n(by)}" ${stroke(item.stroke)} marker-end="url(#${arrowId(item.stroke.color)})"/>`;
      }).join('');
      const away = 0.6 + item.size / 2;
      const side = item.height >= 0 ? 1 : -1;
      const mx = (top.x1 + top.x2) / 2 + top.nx * side * away;
      const my = (top.y1 + top.y2) / 2 + top.ny * side * away;
      const label = item.text
        ? `<text x="${n(mx)}" y="${n(my)}" font-size="${n(item.size)}" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${esc(item.stroke.color)}" text-anchor="middle" dominant-baseline="central">${esc(item.text)}</text>`
        : '';
      return `<g class="cc-load">${arrows}<line x1="${n(top.x1)}" y1="${n(top.y1)}" x2="${n(top.x2)}" y2="${n(top.y2)}" ${stroke(item.stroke)}/>${label}</g>`;
    }
    case 'arc': {
      const from = arcPoint(item, item.start);
      const to = arcPoint(item, item.start + item.sweep);
      const large = Math.abs(item.sweep) > 180 ? 1 : 0;
      const clockwise = item.sweep >= 0 ? 1 : 0;
      return `<path d="M${n(from.x)} ${n(from.y)}A${n(item.r)} ${n(item.r)} 0 ${large} ${clockwise} ${n(to.x)} ${n(to.y)}" fill="none" ${stroke(item.stroke)} stroke-linecap="round"${item.arrow ? ` marker-end="url(#${arrowId(item.stroke.color)})"` : ''}/>`;
    }
    case 'line':
    case 'arrow':
      return `<line x1="${n(item.x1)}" y1="${n(item.y1)}" x2="${n(item.x2)}" y2="${n(item.y2)}" ${stroke(item.stroke)} stroke-linecap="round"${item.type === 'arrow' ? ` marker-end="url(#${arrowId(item.stroke.color)})"` : ''}/>`;
    case 'text': {
      const lines = item.text.split('\n');
      const spans = lines.map((line, i) => `<tspan x="${n(item.x)}" dy="${i === 0 ? 0 : n(item.size * 1.25)}">${esc(line)}</tspan>`).join('');
      return `<text x="${n(item.x)}" y="${n(item.y + item.size)}" font-size="${n(item.size)}" font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${esc(item.color)}"${item.bold ? ' font-weight="bold"' : ''}>${spans}</text>`;
    }
    case 'image': {
      const href = resolveFile(item.src);
      return href
        ? `<image x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" href="${esc(href)}" xlink:href="${esc(href)}" preserveAspectRatio="xMidYMid meet"/>`
        : `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" fill="none" stroke="#c62828" stroke-dasharray="2 1" stroke-width="0.3"/>`;
    }
    default:
      // An item of a newer format version.
      return '';
  }
}

/** The scene as a data: URI for an <img>. */
export function sceneDataUri(scene: CanvasScene, resolveFile?: (path: string) => string | undefined): string {
  const svg = sceneSvg(scene, resolveFile);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
