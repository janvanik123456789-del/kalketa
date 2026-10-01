/**
 * Editing a canvas: a drawing with shapes, arrows, text and pictures placed
 * freely, like a slide. Either right in the sheet (the drawing stays where it
 * is, a tool bar appears over the sheet) or in a large window. It edits a copy
 * of the scene with its own undo; Done gives the scene (and any new pictures)
 * back to the sheet.
 */

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { t, type Catalog } from '@calccanvas/i18n';
import { sceneBody, type CanvasItem, type CanvasScene } from '@calccanvas/render';
import { addItem, boxOf, drawn, endMoved, findItem, itemAt, moved, newId, removeItem, reordered, replaceItem, resized, snap, type Corner, type Tool } from '../logic/canvasEdit.js';
import { fromFile, isPictureType, picturePath, pixelWidth, type IncomingPicture } from '../logic/pictures.js';
import { chooseFile } from '../document.js';
import { ask } from './Ask.js';

interface Props {
  readonly scene: CanvasScene;
  readonly catalog: Catalog;
  /** Pictures already in the calculation file. */
  resolveFile(path: string): string | undefined;
  /** Folder for pictures put on this canvas, e.g. canvases/platno-1. */
  readonly folder: string;
  /** True when a path is taken in the calculation file. */
  taken(path: string): boolean;
  onDone(scene: CanvasScene, files: ReadonlyMap<string, Uint8Array>): void;
  onCancel(): void;
  /** 'inline': in the sheet, sized like the picture it replaces; 'window': a large window. */
  readonly mode?: 'inline' | 'window';
  /** From the sheet into the large window, with what was drawn so far. */
  onExpand?(scene: CanvasScene, files: ReadonlyMap<string, Uint8Array>): void;
}

type Drag =
  | { kind: 'move'; id: string; from: { x: number; y: number }; original: CanvasItem }
  | { kind: 'corner'; id: string; corner: Corner }
  | { kind: 'end'; id: string; end: 1 | 2 }
  | { kind: 'draw'; tool: Exclude<Tool, 'select' | 'text'>; from: { x: number; y: number } }
  | { kind: 'size'; from: { x: number; y: number }; original: { width: number; height: number } };

const WIDTHS = [0.25, 0.35, 0.5, 0.7, 1];
const COLOURS = ['#000000', '#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#757575'];
const TOOLS: readonly { tool: Tool; glyph: string; key: string }[] = [
  { tool: 'select', glyph: '↖', key: 'V' },
  { tool: 'text', glyph: 'T', key: 'T' },
  { tool: 'line', glyph: '╱', key: 'L' },
  { tool: 'arrow', glyph: '↗', key: 'A' },
  { tool: 'rect', glyph: '▭', key: 'R' },
  { tool: 'ellipse', glyph: '◯', key: 'E' },
];

export function CanvasEditor(props: Props) {
  const c = props.catalog;
  const inline = props.mode === 'inline';
  const [history, setHistory] = useState<{ past: CanvasScene[]; present: CanvasScene; future: CanvasScene[] }>({ past: [], present: props.scene, future: [] });
  const scene = history.present;
  const [selected, setSelected] = useState<string | undefined>();
  const [tool, setTool] = useState<Tool>('select');
  const [colour, setColour] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(0.35);
  const [filled, setFilled] = useState(false);
  const [fontSize, setFontSize] = useState(3.5);
  const [files, setFiles] = useState<ReadonlyMap<string, Uint8Array>>(new Map());
  const [draft, setDraft] = useState<CanvasItem | undefined>();
  const drag = useRef<Drag | undefined>(undefined);
  const before = useRef<CanvasScene | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(4);

  // Pixels per millimetre on screen: in the window the drawing fills the space; in the sheet it has the size of the picture.
  useLayoutEffect(() => {
    const fit = () => {
      if (inline) {
        const box = svg.current?.getBoundingClientRect();
        if (box && box.width > 0) setScale(box.width / scene.width);
        return;
      }
      const box = stageBox.current?.getBoundingClientRect();
      if (!box) return;
      setScale(Math.max(1, Math.min(8, (box.width - 40) / scene.width, (box.height - 40) / scene.height)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [scene.width, scene.height]);

  /** A change that can be undone. */
  const commit = (next: CanvasScene, previous: CanvasScene = scene) =>
    setHistory((h) => (next === previous ? { ...h, present: next } : { past: [...h.past, previous], present: next, future: [] }));
  /** A change while dragging: shown, recorded once at the end. */
  const preview = (next: CanvasScene) => setHistory((h) => ({ ...h, present: next }));
  const undo = () => setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h));
  const redo = () => setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1) } : h));

  const resolve = (path: string) => {
    const added = files.get(path);
    return added ? newPictureUri(path, added) : props.resolveFile(path);
  };

  const point = (e: { clientX: number; clientY: number }, free = false) => {
    // From the box on screen, so the zoom of the sheet does not matter.
    const box = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * scene.width;
    const y = ((e.clientY - box.top) / box.height) * scene.height;
    return free ? { x, y } : { x: snap(x, 0.5), y: snap(y, 0.5) };
  };

  const item = findItem(scene, selected);

  // ---------------------------------------------------------------- mouse
  const down = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // In the sheet the row under the drawing must not take the click.
    e.stopPropagation();
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const at = point(e, e.altKey);
    before.current = scene;
    if (handle === 'size') {
      drag.current = { kind: 'size', from: at, original: { width: scene.width, height: scene.height } };
    } else if (handle && item) {
      drag.current = handle === 'p1' || handle === 'p2' ? { kind: 'end', id: item.id, end: handle === 'p1' ? 1 : 2 } : { kind: 'corner', id: item.id, corner: handle as Corner };
    } else if (tool === 'select') {
      const hit = itemAt(scene, at.x, at.y);
      setSelected(hit?.id);
      if (hit) drag.current = { kind: 'move', id: hit.id, from: at, original: hit };
    } else if (tool === 'text') {
      void addText(at);
    } else {
      drag.current = { kind: 'draw', tool, from: at };
    }
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d || !svg.current) return;
      const at = point(e, e.altKey);
      const base = before.current ?? scene;
      if (d.kind === 'move') preview(replaceItem(base, moved(d.original, at.x - d.from.x, at.y - d.from.y)));
      else if (d.kind === 'corner') preview(replaceItem(base, resized(findItem(base, d.id)!, d.corner, at.x, at.y)));
      else if (d.kind === 'end') preview(replaceItem(base, endMoved(findItem(base, d.id)!, d.end, at.x, at.y)));
      else if (d.kind === 'size') preview({ ...base, width: Math.max(20, Math.round(d.original.width + at.x - d.from.x)), height: Math.max(10, Math.round(d.original.height + at.y - d.from.y)) });
      else setDraft(drawn(d.tool, 'draft', d.from.x, d.from.y, at.x, at.y, colour, lineWidth, filled ? colour + '33' : 'none'));
    };
    const up = (e: MouseEvent) => {
      const d = drag.current;
      drag.current = undefined;
      if (!d) return;
      const previous = before.current ?? scene;
      before.current = undefined;
      if (d.kind === 'draw') {
        setDraft(undefined);
        const at = point(e, e.altKey);
        if (Math.hypot(at.x - d.from.x, at.y - d.from.y) < 1) return;
        const id = newId(previous);
        commit(addItem(previous, drawn(d.tool, id, d.from.x, d.from.y, at.x, at.y, colour, lineWidth, filled ? colour + '33' : 'none')), previous);
        setSelected(id);
        setTool('select');
        return;
      }
      setHistory((h) => (h.present === previous ? h : { past: [...h.past, previous], present: h.present, future: [] }));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  // ---------------------------------------------------------------- actions
  const addText = async (at: { x: number; y: number }) => {
    const text = await ask(t(c, 'canvas.textPrompt'));
    if (!text?.trim()) return;
    const id = newId(scene);
    commit(addItem(scene, { id, type: 'text', x: at.x, y: at.y, text: text.trim(), size: fontSize, color: colour }));
    setSelected(id);
    setTool('select');
  };

  const editText = async (target: CanvasItem) => {
    if (target.type !== 'text') return;
    const text = await ask(t(c, 'canvas.textPrompt'), target.text);
    if (text === undefined) return;
    commit(text.trim() ? replaceItem(scene, { ...target, text: text.trim() }) : removeItem(scene, target.id));
  };

  const addPictures = async (pictures: readonly IncomingPicture[]) => {
    let next = scene;
    const added = new Map(files);
    for (const picture of pictures) {
      const path = picturePath(props.folder, picture.name || 'obrazek', picture.type, (p) => props.taken(p) || added.has(p));
      added.set(path, picture.bytes);
      const px = (await pixelWidth(picture)) ?? 300;
      const ratio = await pixelRatio(picture);
      const w = Math.min(next.width * 0.8, (px * 25.4) / 96);
      const h = w / ratio;
      const id = newId(next);
      next = addItem(next, { id, type: 'image', x: (next.width - w) / 2, y: Math.max(0, (next.height - h) / 2), w, h, src: path });
      setSelected(id);
    }
    setFiles(added);
    commit(next);
  };

  const pictureFile = async () => {
    const file = await chooseFile('image/*');
    const picture = file ? await fromFile(file) : undefined;
    if (picture) await addPictures([picture]);
  };

  /** Colour, line width, fill and font size apply to the selected item too. */
  const restyle = (change: { colour?: string; width?: number; fill?: boolean; size?: number }) => {
    if (change.colour !== undefined) setColour(change.colour);
    if (change.width !== undefined) setLineWidth(change.width);
    if (change.fill !== undefined) setFilled(change.fill);
    if (change.size !== undefined) setFontSize(change.size);
    if (!item) return;
    const colourNow = change.colour ?? colour;
    if (item.type === 'text') commit(replaceItem(scene, { ...item, color: colourNow, size: change.size ?? item.size }));
    else if (item.type === 'line' || item.type === 'arrow') commit(replaceItem(scene, { ...item, stroke: { color: colourNow, width: change.width ?? item.stroke.width } }));
    else if (item.type === 'rect' || item.type === 'ellipse') {
      const fill = change.fill ?? item.fill !== 'none';
      commit(replaceItem(scene, { ...item, stroke: { color: colourNow, width: change.width ?? item.stroke.width }, fill: fill ? colourNow + '33' : 'none' }));
    }
  };

  // ---------------------------------------------------------------- keys, paste, drop
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Keys belong to the canvas unless a field or a question over it has them.
      if ((e.target as HTMLElement).matches?.('input, textarea, select') || document.querySelectorAll('.dialog-backdrop').length > (inline ? 0 : 1)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
        e.preventDefault();
        commit(removeItem(scene, item.id));
        setSelected(undefined);
      } else if (e.key.startsWith('Arrow') && item) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(replaceItem(scene, moved(item, dx, dy)));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (selected) setSelected(undefined);
        // In the sheet Esc ends editing and keeps the drawing; the window closes without saving.
        else if (inline) props.onDone(scene, files);
        else props.onCancel();
      } else if (!ctrl && !e.altKey) {
        const chosen = TOOLS.find((x) => x.key === e.key.toUpperCase());
        if (chosen) setTool(chosen.tool);
      }
    };
    const paste = (e: ClipboardEvent) => {
      const pictures = [...(e.clipboardData?.files ?? [])].filter((f) => isPictureType(f.type));
      if (pictures.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void Promise.all(pictures.map(fromFile)).then((list) => void addPictures(list.filter((p): p is IncomingPicture => p !== undefined)));
    };
    window.addEventListener('keydown', key);
    window.addEventListener('paste', paste, true);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('paste', paste, true);
    };
  });

  // In the sheet a click anywhere else ends editing and keeps the drawing.
  const toolbar = useRef<HTMLDivElement>(null);
  const doneRef = useRef(() => props.onDone(scene, files));
  doneRef.current = () => props.onDone(scene, files);
  useEffect(() => {
    if (!inline) return;
    const outside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (svg.current?.contains(target) || toolbar.current?.contains(target) || target.closest('.dialog-backdrop, .context-menu, .menu-panel')) return;
      doneRef.current();
    };
    // Listening starts after the double click that opened the editing.
    const timer = window.setTimeout(() => window.addEventListener('mousedown', outside, true));
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', outside, true);
    };
  }, [inline]);

  // The tool bar of editing in the sheet sits over the top of the sheet, outside its zoom.
  const [barAt, setBarAt] = useState<{ left: number; top: number; maxWidth: number } | undefined>();
  useLayoutEffect(() => {
    if (!inline) return;
    const place = () => {
      const area = svg.current?.closest('.sheet-scroll')?.getBoundingClientRect();
      // Within the sheet: the bar wraps rather than covering a side panel.
      if (area) setBarAt({ left: area.left + 8, top: area.top + 6, maxWidth: area.width - 16 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [inline]);

  const drop = (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void Promise.all([...e.dataTransfer.files].map(fromFile)).then((list) => void addPictures(list.filter((p): p is IncomingPicture => p !== undefined)));
  };

  // ---------------------------------------------------------------- view
  const handleSize = 9 / scale;
  const selection = item ? selectionMarks(item, handleSize) : null;

  const tools = (
    <>
          {TOOLS.map((x) => (
            <button key={x.tool} type="button" className={tool === x.tool ? 'active' : ''} title={`${t(c, `canvas.tool.${x.tool}` as Parameters<typeof t>[1])} (${x.key})`} data-tool={x.tool} onClick={() => setTool(x.tool)}>
              {x.glyph}
            </button>
          ))}
          <button type="button" title={t(c, 'canvas.picture')} onClick={() => void pictureFile()}>
            🖼
          </button>
          <span className="canvas-sep" />
          {COLOURS.map((value) => (
            <button key={value} type="button" className={`swatch${colour === value ? ' active' : ''}`} style={{ background: value }} title={value} onClick={() => restyle({ colour: value })} />
          ))}
          <select value={lineWidth} title={t(c, 'canvas.lineWidth')} onChange={(e) => restyle({ width: Number(e.target.value) })}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {String(w).replace('.', ',')} mm
              </option>
            ))}
          </select>
          <label title={t(c, 'canvas.fill')}>
            <input type="checkbox" checked={filled} onChange={(e) => restyle({ fill: e.target.checked })} /> {t(c, 'canvas.fill')}
          </label>
          <select value={fontSize} title={t(c, 'canvas.fontSize')} onChange={(e) => restyle({ size: Number(e.target.value) })}>
            {[2.5, 3, 3.5, 4, 5, 6, 8].map((s) => (
              <option key={s} value={s}>
                {String(s).replace('.', ',')} mm
              </option>
            ))}
          </select>
          <span className="canvas-sep" />
          <button type="button" disabled={!item} title={t(c, 'canvas.front')} onClick={() => item && commit(reordered(scene, item.id, 'front'))}>
            ⬒
          </button>
          <button type="button" disabled={!item} title={t(c, 'canvas.back')} onClick={() => item && commit(reordered(scene, item.id, 'back'))}>
            ⬓
          </button>
          <button
            type="button"
            disabled={!item}
            title={t(c, 'canvas.delete')}
            onClick={() => {
              if (!item) return;
              commit(removeItem(scene, item.id));
              setSelected(undefined);
            }}
          >
            🗑
          </button>
          <span className="canvas-sep" />
          <button type="button" disabled={history.past.length === 0} title={t(c, 'canvas.undo')} onClick={undo}>
            ↶
          </button>
          <button type="button" disabled={history.future.length === 0} title={t(c, 'canvas.redo')} onClick={redo}>
            ↷
          </button>
    </>
  );

  const stage = (
          <svg
            ref={svg}
            className={`canvas-svg tool-${tool}`}
            width={inline ? '100%' : scene.width * scale}
            height={inline ? undefined : scene.height * scale}
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            onMouseDown={down}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const at = point(e, true);
              const hit = itemAt(scene, at.x, at.y);
              if (hit) void editText(hit);
            }}
          >
            <defs>
              <pattern id="cc-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M10 0H0V10" fill="none" stroke="#dde3ea" strokeWidth={1 / scale} />
              </pattern>
            </defs>
            <rect width={scene.width} height={scene.height} fill="#fff" />
            <rect width={scene.width} height={scene.height} fill="url(#cc-grid)" />
            <g dangerouslySetInnerHTML={{ __html: sceneBody(draft ? addItem(scene, draft) : scene, resolve) }} />
            {selection}
            <rect className="canvas-size-handle" data-handle="size" x={scene.width - handleSize} y={scene.height - handleSize} width={handleSize} height={handleSize} />
          </svg>
  );

  if (inline) {
    return (
      <>
        {createPortal(
          <div ref={toolbar} className="canvas-toolbar canvas-inline-bar" style={barAt} onMouseDown={(e) => e.stopPropagation()}>
            {tools}
            <span className="canvas-sep" />
            <button type="button" title={t(c, 'canvas.expand')} onClick={() => props.onExpand?.(scene, files)}>
              ⤢
            </button>
            <button type="button" className="canvas-done" data-canvas="done" onClick={() => props.onDone(scene, files)}>
              {t(c, 'canvas.done')}
            </button>
          </div>,
          document.body,
        )}
        <div className="canvas-inline" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
          {stage}
        </div>
      </>
    );
  }

  return (
    <div className="dialog-backdrop canvas-backdrop">
      <div className="canvas-window" role="dialog" aria-modal="true" aria-label={t(c, 'canvas.title')}>
        <div className="dialog-title">
          <span>{t(c, 'canvas.title')}</span>
        </div>
        <div className="canvas-toolbar">{tools}</div>
        <div className="canvas-stage" ref={stageBox} onDragOver={(e) => e.preventDefault()} onDrop={drop}>
          {stage}
        </div>
        <div className="dialog-buttons canvas-buttons">
          <span className="canvas-info">
            {t(c, 'canvas.size')}: {scene.width} × {scene.height} mm · {t(c, 'canvas.hint')}
          </span>
          <button type="button" className="default" data-canvas="done" onClick={() => props.onDone(scene, files)}>
            {t(c, 'canvas.done')}
          </button>
          <button type="button" onClick={props.onCancel}>
            {t(c, 'dlg.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The frame of the selected item with its handles: corners of a box, ends of a line. */
function selectionMarks(item: CanvasItem, size: number) {
  if (item.type === 'line' || item.type === 'arrow') {
    return (
      <g className="canvas-selection">
        {[
          ['p1', item.x1, item.y1],
          ['p2', item.x2, item.y2],
        ].map(([name, x, y]) => (
          <rect key={name as string} className="canvas-handle" data-handle={name as string} x={(x as number) - size / 2} y={(y as number) - size / 2} width={size} height={size} />
        ))}
      </g>
    );
  }
  const b = boxOf(item);
  const corners: [Corner, number, number][] = [
    ['nw', b.x, b.y],
    ['ne', b.x + b.w, b.y],
    ['sw', b.x, b.y + b.h],
    ['se', b.x + b.w, b.y + b.h],
  ];
  return (
    <g className="canvas-selection">
      <rect className="canvas-frame" x={b.x} y={b.y} width={b.w} height={b.h} />
      {corners.map(([name, x, y]) => (
        <rect key={name} className="canvas-handle" data-handle={name} x={x - size / 2} y={y - size / 2} width={size} height={size} />
      ))}
    </g>
  );
}

const pictureUris = new WeakMap<Uint8Array, string>();
function newPictureUri(path: string, bytes: Uint8Array): string {
  let uri = pictureUris.get(bytes);
  if (!uri) {
    uri = URL.createObjectURL(new Blob([bytes as BlobPart], { type: path.endsWith('.svg') ? 'image/svg+xml' : `image/${path.split('.').pop()}` }));
    pictureUris.set(bytes, uri);
  }
  return uri;
}

/** Width / height of a picture; 4:3 when it cannot be decoded. */
async function pixelRatio(picture: IncomingPicture): Promise<number> {
  try {
    const bitmap = await createImageBitmap(new Blob([picture.bytes as BlobPart], { type: picture.type }));
    const ratio = bitmap.width / bitmap.height;
    bitmap.close();
    return ratio || 4 / 3;
  } catch {
    return 4 / 3;
  }
}
