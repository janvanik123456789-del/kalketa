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
  | (ItemBase & { readonly type: 'rect' | 'ellipse'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly stroke: Stroke; readonly fill: string })
  | (ItemBase & { readonly type: 'line' | 'arrow'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly stroke: Stroke })
  | (ItemBase & { readonly type: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly size: number; readonly color: string; readonly bold?: boolean })
  | (ItemBase & { readonly type: 'image'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly src: string });

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

/** An arrowhead per colour of the arrows in the scene (markers take no colour from their line everywhere). */
function arrowDefs(scene: CanvasScene): string {
  const colours = [...new Set(scene.items.flatMap((i) => (i.type === 'arrow' ? [i.stroke.color] : [])))];
  if (colours.length === 0) return '';
  const markers = colours.map(
    (c) => `<marker id="${arrowId(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0L10 5L0 10z" fill="${esc(c)}"/></marker>`,
  );
  return `<defs>${markers.join('')}</defs>`;
}

const arrowId = (colour: string) => `cc-arrow-${colour.replace(/[^a-zA-Z0-9]/g, '')}`;

export function itemSvg(item: CanvasItem, resolveFile: (path: string) => string | undefined): string {
  const stroke = (s: Stroke) => `stroke="${esc(s.color)}" stroke-width="${n(s.width)}"`;
  switch (item.type) {
    case 'rect':
      return `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" fill="${esc(item.fill)}" ${stroke(item.stroke)}/>`;
    case 'ellipse':
      return `<ellipse cx="${n(item.x + item.w / 2)}" cy="${n(item.y + item.h / 2)}" rx="${n(item.w / 2)}" ry="${n(item.h / 2)}" fill="${esc(item.fill)}" ${stroke(item.stroke)}/>`;
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
