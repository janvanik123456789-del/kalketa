/**
 * Editing a canvas: a drawing with shapes, arrows, text and pictures placed
 * freely, like a slide. Either right in the sheet (the drawing stays where it
 * is, a tool bar appears over the sheet) or in a large window. It edits a copy
 * of the scene with its own undo; Done gives the scene (and any new pictures)
 * back to the sheet.
 */

import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { FontOptions } from './FontOptions.js';
import { sceneBody, type CanvasItem, type CanvasScene, type LiveValues, type TextFont } from '../scene.js';
import { addItem, boxOf, drawn, endMoved, endsOf, findItem, isSupportTool, itemAt, itemsIn, moved, newId, placedSupport, removeItem, reordered, replaceItem, resized, snap, turned, type Corner, type Tool } from '../edit.js';
import { fromFile, isPictureType, picturePath, pixelSize, type CanvasPicture } from './pictures.js';
import { canvasTexts, type CanvasTextKey } from './texts.js';
import { TextEditor } from './TextEditor.js';
import './canvas.css';

export interface CanvasEditorProps {
  readonly scene: CanvasScene;
  /** Language of the texts, e.g. "cs". */
  readonly language: string;
  /** The fonts of the system to offer for texts (by family name). */
  readonly fonts?: readonly string[];
  /** Asks for a line of text in the host's own dialog; undefined when cancelled. */
  ask(label: string, initial?: string): Promise<string | undefined>;
  /** Lets the user choose a picture file. */
  chooseImage(): Promise<File | undefined>;
  /** Where the tool bar of editing in the sheet goes: the box of the host's sheet area (the window when absent). */
  area?(): DOMRect | undefined;
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
  /** Values of the calculation for {names} in the texts and labels. */
  values?: LiveValues;
}

type Drag =
  | { kind: 'move'; from: { x: number; y: number }; originals: readonly CanvasItem[] }
  | { kind: 'frame'; from: { x: number; y: number }; add: readonly string[] }
  | { kind: 'corner'; id: string; corner: Corner }
  | { kind: 'end'; id: string; end: 1 | 2 | 3 }
  | { kind: 'draw'; tool: Exclude<Tool, 'select' | 'text' | 'pin' | 'roller' | 'fixed' | 'hinge'>; from: { x: number; y: number } }
  | { kind: 'size'; from: { x: number; y: number }; original: { width: number; height: number } };

const WIDTHS = [0.25, 0.35, 0.5, 0.7, 1];
const FONT_SIZES = [2.5, 3, 3.5, 4, 5, 6, 8];
const COLOURS = ['#000000', '#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#757575'];
const TOOLS: readonly { tool: Tool; glyph: string; key: string }[] = [
  { tool: 'select', glyph: '↖', key: 'V' },
  { tool: 'text', glyph: 'T', key: 'T' },
  { tool: 'line', glyph: '╱', key: 'L' },
  { tool: 'arrow', glyph: '↗', key: 'A' },
  { tool: 'force', glyph: '⇣F', key: 'S' },
  { tool: 'rect', glyph: '▭', key: 'R' },
  { tool: 'ellipse', glyph: '◯', key: 'E' },
  { tool: 'dimension', glyph: '↔', key: 'D' },
  { tool: 'arc', glyph: '◠', key: 'O' },
  { tool: 'moment', glyph: '↻', key: 'M' },
  { tool: 'pin', glyph: '△', key: 'P' },
  { tool: 'roller', glyph: '⍙', key: 'K' },
  { tool: 'fixed', glyph: '▥', key: 'F' },
  { tool: 'hinge', glyph: '◦', key: 'H' },
  { tool: 'load', glyph: '⇊', key: 'Q' },
];

export function CanvasEditor(props: CanvasEditorProps) {
  const texts = canvasTexts(props.language);
  const text = (key: CanvasTextKey) => texts[key];
  const inline = props.mode === 'inline';
  const [history, setHistory] = useState<{ past: CanvasScene[]; present: CanvasScene; future: CanvasScene[] }>({ past: [], present: props.scene, future: [] });
  const scene = history.present;
  // The items chosen: one gets its handles, several move, change and go together.
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const selected = chosen.length === 1 ? chosen[0] : undefined;
  const setSelected = (id: string | undefined) => setChosen(id ? [id] : []);
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number } | undefined>();
  // A text being written in the drawing: shown by the field over it, not in the drawing.
  const [writing, setWriting] = useState<Extract<CanvasItem, { type: 'text' }> | undefined>();
  const [tool, setTool] = useState<Tool>('select');
  const [colour, setColour] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(0.35);
  const [filled, setFilled] = useState(false);
  const [hatched, setHatched] = useState(false);
  const [fontSize, setFontSize] = useState(3.5);
  const [font, setFont] = useState<TextFont>('sans');
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
  const group = chosen.map((id) => findItem(scene, id)).filter((i): i is CanvasItem => i !== undefined);

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
      drag.current = /^p[123]$/.test(handle) ? { kind: 'end', id: item.id, end: Number(handle.slice(1)) as 1 | 2 | 3 } : { kind: 'corner', id: item.id, corner: handle as Corner };
    } else if (tool === 'select') {
      const hit = itemAt(scene, at.x, at.y);
      if (hit && e.shiftKey) {
        // Shift adds an item to the chosen ones, or takes it away.
        setChosen(chosen.includes(hit.id) ? chosen.filter((id) => id !== hit.id) : [...chosen, hit.id]);
        return;
      }
      if (hit) {
        const moving = chosen.includes(hit.id) ? group : [hit];
        if (!chosen.includes(hit.id)) setSelected(hit.id);
        drag.current = { kind: 'move', from: at, originals: moving };
      } else {
        // On an empty place a frame chooses what it catches.
        if (!e.shiftKey) setChosen([]);
        drag.current = { kind: 'frame', from: at, add: e.shiftKey ? chosen : [] };
      }
    } else if (tool === 'text') {
      startWriting(at);
    } else if (isSupportTool(tool)) {
      // A support goes where it is clicked.
      const id = newId(scene);
      commit(addItem(scene, placedSupport(tool, id, at.x, at.y, colour, lineWidth)));
      setSelected(id);
      setTool('select');
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
      if (d.kind === 'move') preview(d.originals.reduce((s, original) => replaceItem(s, moved(original, at.x - d.from.x, at.y - d.from.y)), base));
      else if (d.kind === 'frame') setFrame({ x: Math.min(d.from.x, at.x), y: Math.min(d.from.y, at.y), w: Math.abs(at.x - d.from.x), h: Math.abs(at.y - d.from.y) });
      else if (d.kind === 'corner') preview(replaceItem(base, resized(findItem(base, d.id)!, d.corner, at.x, at.y)));
      else if (d.kind === 'end') preview(replaceItem(base, endMoved(findItem(base, d.id)!, d.end, at.x, at.y)));
      else if (d.kind === 'size') preview({ ...base, width: Math.max(20, Math.round(d.original.width + at.x - d.from.x)), height: Math.max(10, Math.round(d.original.height + at.y - d.from.y)) });
      else setDraft(drawn(d.tool, 'draft', d.from.x, d.from.y, at.x, at.y, colour, lineWidth, filled ? colour + '33' : 'none', '', fontSize, hatched));
    };
    const up = (e: MouseEvent) => {
      const d = drag.current;
      drag.current = undefined;
      if (!d) return;
      const previous = before.current ?? scene;
      before.current = undefined;
      if (d.kind === 'frame') {
        setFrame(undefined);
        const at = point(e, true);
        const caught = Math.hypot(at.x - d.from.x, at.y - d.from.y) < 1 ? [] : itemsIn(previous, d.from.x, d.from.y, at.x, at.y);
        setChosen([...new Set([...d.add, ...caught])]);
        return;
      }
      if (d.kind === 'draw') {
        setDraft(undefined);
        const at = point(e, e.altKey);
        if (Math.hypot(at.x - d.from.x, at.y - d.from.y) < 1) return;
        const id = newId(previous);
        const shape = drawn(d.tool, id, d.from.x, d.from.y, at.x, at.y, colour, lineWidth, filled ? colour + '33' : 'none', '', fontSize, hatched);
        setTool('select');
        const prompt = shape.type === 'load' ? 'loadPrompt' : shape.type === 'dimension' ? 'dimensionPrompt' : d.tool === 'force' ? 'forcePrompt' : undefined;
        if (prompt) {
          // A dimension says what it measures, a load and a force how much: the label is asked for right away.
          void ask(text(prompt)).then((label) => {
            if (label === undefined) return;
            commit(addItem(previous, { ...shape, text: label.trim() } as CanvasItem), previous);
            setSelected(id);
          });
          return;
        }
        commit(addItem(previous, shape), previous);
        setSelected(id);
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
  /** While the host's dialog asks for a text, keys and clicks are its own. */
  const asking = useRef(false);
  const ask = async (label: string, initial?: string) => {
    asking.current = true;
    try {
      return await props.ask(label, initial);
    } finally {
      asking.current = false;
    }
  };

  /** A new text written where the canvas was clicked, right in the drawing. */
  const startWriting = (at: { x: number; y: number }) => {
    setSelected(undefined);
    setTool('select');
    setWriting({ id: newId(scene), type: 'text', x: at.x, y: at.y, text: '', size: fontSize, color: colour, ...(font !== 'sans' ? { font } : {}) });
  };
  /** The text written: put in, changed, or gone when nothing is left of it. */
  const doneWriting = (written: Extract<CanvasItem, { type: 'text' }> | undefined) => {
    const target = writing;
    setWriting(undefined);
    if (!target) return;
    const old = findItem(scene, target.id);
    if (!written) {
      if (old) commit(removeItem(scene, old.id));
      return;
    }
    commit(old ? replaceItem(scene, written) : addItem(scene, written));
    setSelected(written.id);
  };

  const editText = async (target: CanvasItem) => {
    if (target.type === 'dimension' || target.type === 'load' || (target.type === 'arrow' && target.text !== undefined)) {
      const key = target.type === 'load' ? 'loadPrompt' : target.type === 'dimension' ? 'dimensionPrompt' : 'forcePrompt';
      const value = await ask(text(key), target.text);
      if (value !== undefined) commit(replaceItem(scene, { ...target, text: value.trim() }));
      return;
    }
    if (target.type === 'text') setWriting(target);
  };

  const addPictures = async (pictures: readonly CanvasPicture[]) => {
    let next = scene;
    const added = new Map(files);
    for (const picture of pictures) {
      const path = picturePath(props.folder, picture.name || 'obrazek', picture.type, (p) => props.taken(p) || added.has(p));
      added.set(path, picture.bytes);
      // At 96 dpi, as large as on screen, at most most of the canvas.
      const size = (await pixelSize(picture)) ?? { width: 300, height: 225 };
      const w = Math.min(next.width * 0.8, (size.width * 25.4) / 96);
      const h = (w * size.height) / size.width;
      const id = newId(next);
      next = addItem(next, { id, type: 'image', x: (next.width - w) / 2, y: Math.max(0, (next.height - h) / 2), w, h, src: path });
      setSelected(id);
    }
    setFiles(added);
    commit(next);
  };

  const pictureFile = async () => {
    const file = await props.chooseImage();
    const picture = file ? await fromFile(file) : undefined;
    if (picture) await addPictures([picture]);
  };

  /** Colour, line width, fill and font size apply to the selected item too. */
  const restyle = (change: { colour?: string; width?: number; fill?: boolean; hatch?: boolean; size?: number; font?: TextFont }) => {
    if (change.font !== undefined) setFont(change.font);
    if (change.colour !== undefined) setColour(change.colour);
    if (change.width !== undefined) setLineWidth(change.width);
    if (change.fill !== undefined) setFilled(change.fill);
    if (change.hatch !== undefined) setHatched(change.hatch);
    if (change.size !== undefined) setFontSize(change.size);
    if (group.length === 0) return;
    // Only what was changed goes to the chosen items: a colour chosen for several keeps their widths.
    const restyled = (target: CanvasItem): CanvasItem => {
      const strokeOf = (s: { color: string; width: number }) => ({ color: change.colour ?? s.color, width: change.width ?? s.width });
      if (target.type === 'text') return { ...target, color: change.colour ?? target.color, size: change.size ?? target.size, ...(change.font ? { font: change.font } : {}) };
      if (target.type === 'line' || target.type === 'arc' || target.type === 'support') return { ...target, stroke: strokeOf(target.stroke) };
      if (target.type === 'arrow') return { ...target, stroke: strokeOf(target.stroke), ...(target.text !== undefined && change.size !== undefined ? { size: change.size } : {}) };
      if (target.type === 'dimension' || target.type === 'load') return { ...target, stroke: strokeOf(target.stroke), size: change.size ?? target.size };
      if (target.type === 'rect' || target.type === 'ellipse') {
        const stroke = strokeOf(target.stroke);
        const fill = change.fill ?? target.fill !== 'none';
        const { hatch: _hatch, ...plain } = target;
        const hatch = change.hatch ?? !!target.hatch;
        return { ...plain, stroke, fill: fill ? stroke.color + '33' : 'none', ...(hatch ? { hatch: true } : {}) };
      }
      return target;
    };
    commit(group.reduce((s, target) => replaceItem(s, restyled(target)), scene));
  };

  // ---------------------------------------------------------------- keys, paste, drop
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Keys belong to the canvas unless a field or a question over it has them.
      if (asking.current || writing || (e.target as HTMLElement).matches?.('input, textarea, select, [contenteditable]')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setChosen(scene.items.map((i) => i.id));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && group.length > 0) {
        e.preventDefault();
        commit(group.reduce((s, target) => removeItem(s, target.id), scene));
        setChosen([]);
      } else if (e.key.startsWith('Arrow') && group.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        commit(group.reduce((s, target) => replaceItem(s, moved(target, dx, dy)), scene));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (chosen.length > 0) setChosen([]);
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
      void Promise.all(pictures.map(fromFile)).then((list) => void addPictures(list.filter((p): p is CanvasPicture => p !== undefined)));
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
      if (asking.current || svg.current?.contains(target) || toolbar.current?.contains(target) || target.closest?.('.canvas-text-bar, .canvas-text-editing')) return;
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
      const area = props.area?.() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      // Within the sheet: the bar wraps rather than covering a side panel.
      setBarAt({ left: area.left + 8, top: area.top + 6, maxWidth: area.width - 16 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [inline]);

  const drop = (e: ReactDragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void Promise.all([...e.dataTransfer.files].map(fromFile)).then((list) => void addPictures(list.filter((p): p is CanvasPicture => p !== undefined)));
  };

  // ---------------------------------------------------------------- view
  const handleSize = 9 / scale;
  const selection = item ? selectionMarks(item, handleSize) : null;

  const tools = (
    <>
          {TOOLS.map((x) => (
            <button key={x.tool} type="button" className={tool === x.tool ? 'active' : ''} title={`${text(`tool.${x.tool}`)} (${x.key})`} data-tool={x.tool} onClick={() => setTool(x.tool)}>
              {x.glyph}
            </button>
          ))}
          <button type="button" title={text('picture')} onClick={() => void pictureFile()}>
            🖼
          </button>
          <span className="canvas-sep" />
          {COLOURS.map((value) => (
            <button key={value} type="button" className={`swatch${colour === value ? ' active' : ''}`} style={{ background: value }} title={value} onClick={() => restyle({ colour: value })} />
          ))}
          <select value={lineWidth} title={text('lineWidth')} onChange={(e) => restyle({ width: Number(e.target.value) })}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {String(w).replace('.', ',')} mm
              </option>
            ))}
          </select>
          <label title={text('fill')}>
            <input type="checkbox" checked={filled} onChange={(e) => restyle({ fill: e.target.checked })} /> {text('fill')}
          </label>
          <label title={text('hatch')}>
            <input type="checkbox" data-canvas="hatch" checked={hatched} onChange={(e) => restyle({ hatch: e.target.checked })} /> {text('hatch')}
          </label>
          <select value={item?.type === 'text' ? (item.font ?? 'sans') : font} title={text('font')} data-canvas="font" onChange={(e) => restyle({ font: e.target.value as TextFont })}>
            <FontOptions fonts={props.fonts ?? []} current={item?.type === 'text' ? (item.font ?? 'sans') : font} text={text} />
          </select>
          <select value={fontSize} title={text('fontSize')} onChange={(e) => restyle({ size: Number(e.target.value) })}>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>
                {String(s).replace('.', ',')} mm
              </option>
            ))}
          </select>
          <span className="canvas-sep" />
          <button type="button" disabled={item?.type !== 'support'} title={text('turn')} data-canvas="turn" onClick={() => item && commit(replaceItem(scene, turned(item)))}>
            ⟳
          </button>
          <button type="button" disabled={!item} title={text('front')} onClick={() => item && commit(reordered(scene, item.id, 'front'))}>
            ⬒
          </button>
          <button type="button" disabled={!item} title={text('back')} onClick={() => item && commit(reordered(scene, item.id, 'back'))}>
            ⬓
          </button>
          <button
            type="button"
            disabled={group.length === 0}
            title={text('delete')}
            onClick={() => {
              commit(group.reduce((s, target) => removeItem(s, target.id), scene));
              setChosen([]);
            }}
          >
            🗑
          </button>
          <span className="canvas-sep" />
          <button type="button" disabled={history.past.length === 0} title={text('undo')} onClick={undo}>
            ↶
          </button>
          <button type="button" disabled={history.future.length === 0} title={text('redo')} onClick={redo}>
            ↷
          </button>
    </>
  );

  const writer = writing && (
    <TextEditor
      key={writing.id}
      item={writing}
      stage={() => {
        const box = svg.current?.getBoundingClientRect();
        return box ? { box, width: scene.width } : undefined;
      }}
      colours={COLOURS}
      sizes={FONT_SIZES}
      fonts={props.fonts ?? []}
      text={text}
      onDone={doneWriting}
    />
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
            <g dangerouslySetInnerHTML={{ __html: sceneBody(writing ? removeItem(scene, writing.id) : draft ? addItem(scene, draft) : scene, resolve, props.values) }} />
            {selection}
            {chosen.length > 1 &&
              group.map((g) => {
                const b = boxOf(g);
                return <rect key={g.id} className="canvas-frame" x={b.x} y={b.y} width={b.w} height={b.h} />;
              })}
            {frame && <rect className="canvas-marquee" x={frame.x} y={frame.y} width={frame.w} height={frame.h} />}
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
            <button type="button" title={text('expand')} onClick={() => props.onExpand?.(scene, files)}>
              ⤢
            </button>
            <button type="button" className="canvas-done" data-canvas="done" onClick={() => props.onDone(scene, files)}>
              {text('done')}
            </button>
          </div>,
          document.body,
        )}
        <div className="canvas-inline" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
          {stage}
        </div>
        {writer}
      </>
    );
  }

  return (
    <div className="canvas-backdrop">
      <div className="canvas-window" role="dialog" aria-modal="true" aria-label={text('title')}>
        <div className="canvas-title">{text('title')}</div>
        <div className="canvas-toolbar">{tools}</div>
        <div className="canvas-stage" ref={stageBox} onDragOver={(e) => e.preventDefault()} onDrop={drop}>
          {stage}
        </div>
        {writer}
        <div className="canvas-buttons">
          <span className="canvas-info">
            {text('size')}: {scene.width} × {scene.height} mm · {text('hint')}
          </span>
          <button type="button" className="canvas-done" data-canvas="done" onClick={() => props.onDone(scene, files)}>
            {text('done')}
          </button>
          <button type="button" onClick={props.onCancel}>
            {text('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The frame of the selected item with its handles: corners of a box; ends of a line, a dimension, an arc. */
function selectionMarks(item: CanvasItem, size: number) {
  const ends = endsOf(item);
  if (ends) {
    return (
      <g className="canvas-selection">
        {ends.map(({ end, x, y }) => (
          <rect key={end} className="canvas-handle" data-handle={`p${end}`} x={x - size / 2} y={y - size / 2} width={size} height={size} />
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
