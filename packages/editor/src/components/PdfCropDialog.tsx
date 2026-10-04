/**
 * Cut-outs from a study PDF (docs/01-filozofie.md, ch. 9.6): the text a PDF
 * gives loses its pictures and turns formulas into scraps, so the page is shown
 * as it is printed and the user drags a rectangle around a picture, formula or
 * table; it goes into the sources as a picture, captioned with its page, next
 * to the text it stood by. Several cut-outs in one go; Close ends it.
 *
 * pdf.js draws the pages here, in the editor (the main process has no canvas).
 */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { t, type Catalog } from '@kalketa/i18n';
import { selectedPages } from '@kalketa/sheet';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { desktop } from '../document.js';
import type { IncomingPicture } from '../logic/pictures.js';
import type { FoundLibrary } from '../theoryLibraries.js';
import { Dialog } from './Dialogs.js';

type PdfDocument = Awaited<ReturnType<typeof import('pdfjs-dist').getDocument>['promise']>;
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

/** The text next to a cut-out on its page: the line above it and the line below, to find its place in the sources. */
export interface CutAnchor {
  readonly before?: string;
  readonly after?: string;
}

interface Props {
  readonly catalog: Catalog;
  /** The study PDFs of the theory folders. */
  readonly files: readonly FoundLibrary[];
  readonly sheetPath?: string;
  onInsert(picture: IncomingPicture, caption: string, anchor: CutAnchor): void;
  onClose(): void;
}

/** Cut-outs are drawn at this resolution, however small the page is on screen. */
const CUT_DPI = 200;
/** A cut-out smaller than this (CSS pixels) is taken for a slip of the mouse. */
const MIN_CUT = 6;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The lines of a page with where they are on screen (top of the line, CSS pixels at `scale`). */
async function pageLines(page: PdfPage, scale: number): Promise<{ y: number; text: string }[]> {
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const lines = new Map<number, { y: number; parts: { x: number; text: string }[] }>();
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [x, y] = viewport.convertToViewportPoint(item.transform[4] as number, item.transform[5] as number) as [number, number];
    const height = Math.abs(item.transform[3] as number) * scale;
    const key = Math.round(y / 3);
    const line = lines.get(key) ?? { y: y - height, parts: [] };
    line.parts.push({ x, text: item.str });
    lines.set(key, line);
  }
  return [...lines.values()].map((l) => ({ y: l.y, text: l.parts.sort((a, b) => a.x - b.x).map((p) => p.text).join(' ').trim() })).sort((a, b) => a.y - b.y);
}

export function PdfCropDialog({ catalog, files, sheetPath, onInsert, onClose }: Props) {
  const pdfs = files.filter((f) => f.study?.content.kind === 'pdf');
  const [path, setPath] = useState(pdfs[0]?.path);
  const file = pdfs.find((f) => f.path === path) ?? pdfs[0];
  const count = file?.study?.content.pages.length ?? 0;
  // The first page the file's card chooses, else the first page.
  const firstPage = (f: FoundLibrary | undefined) => (f?.study ? (selectedPages(f.study.content, f.study.settings)[0] ?? 1) : 1);
  const [page, setPage] = useState(() => firstPage(file));
  // 1 = the page as wide as the window.
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState<string>();
  const [cut, setCut] = useState<Rect>();
  const [rendered, setRendered] = useState(false);
  const [inserted, setInserted] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const docs = useRef(new Map<string, Promise<PdfDocument>>());
  // The page's scale on screen: PDF points to CSS pixels.
  const scale = useRef(1);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);

  const open = (f: FoundLibrary): Promise<PdfDocument> => {
    let doc = docs.current.get(f.path);
    if (!doc) {
      doc = (async () => {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const bytes = await desktop!.studyBytes(f.path, sheetPath);
        return pdfjs.getDocument({ data: bytes }).promise;
      })();
      docs.current.set(f.path, doc);
    }
    return doc;
  };

  // Draws the page: as wide as the window times the zoom.
  useEffect(() => {
    if (!file || !desktop) return;
    let live = true;
    setRendered(false);
    setCut(undefined);
    void (async () => {
      try {
        const doc = await open(file);
        const pdfPage = await doc.getPage(page);
        const target = canvas.current;
        if (!live || !target) return;
        const width = Math.max(200, (view.current?.clientWidth ?? 800) - 24);
        scale.current = (width / pdfPage.getViewport({ scale: 1 }).width) * zoom;
        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale.current * ratio });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.width = `${Math.floor(viewport.width / ratio)}px`;
        target.style.height = `${Math.floor(viewport.height / ratio)}px`;
        // As for print: drawn at once, not frame by frame, which waits while the window is in the background.
        await pdfPage.render({ canvas: target, viewport, intent: 'print' }).promise;
        if (live) setRendered(true);
        setFailed(undefined);
      } catch (error) {
        if (live) setFailed(t(catalog, 'crop.failed', { error: error instanceof Error ? error.message : String(error) }));
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path, page, zoom]);

  const at = (e: ReactMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const zoomBy = (direction: 1 | -1) => setZoom((z) => (direction > 0 ? (ZOOMS.find((s) => s > z + 0.01) ?? z) : ([...ZOOMS].reverse().find((s) => s < z - 0.01) ?? z)));

  /** The cut-out at CUT_DPI as a PNG, with the lines next to it; the window stays open for more. */
  const insert = async () => {
    if (!file || !cut) return;
    try {
      const doc = await open(file);
      const pdfPage = await doc.getPage(page);
      const sharp = CUT_DPI / 72;
      // From the rectangle on screen to the cut-out's resolution.
      const k = sharp / scale.current;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(cut.w * k));
      out.height = Math.max(1, Math.round(cut.h * k));
      const viewport = pdfPage.getViewport({ scale: sharp, offsetX: -cut.x * k, offsetY: -cut.y * k });
      await pdfPage.render({ canvas: out, viewport, intent: 'print' }).promise;
      // At once, not through toBlob, whose answer can wait while the window is in the background.
      const bytes = Uint8Array.from(atob(out.toDataURL('image/png').split(',')[1] ?? ''), (c) => c.charCodeAt(0));
      const lines = await pageLines(pdfPage, scale.current);
      const before = [...lines].reverse().find((l) => l.y < cut.y && l.text.replace(/\s/g, '').length >= 8)?.text;
      const after = lines.find((l) => l.y > cut.y + cut.h && l.text.replace(/\s/g, '').length >= 8)?.text;
      const label = file.study?.content.labels?.[page - 1] ?? String(page);
      onInsert({ name: `vyrez-s${label}.png`, type: 'image/png', bytes }, t(catalog, 'crop.caption', { title: file.library.manifest.title, page: label }), { ...(before ? { before } : {}), ...(after ? { after } : {}) });
      setInserted((n) => n + 1);
      setCut(undefined);
    } catch (error) {
      setFailed(t(catalog, 'crop.failed', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const label = (p: number) => file?.study?.content.labels?.[p - 1] ?? String(p);
  const ready = !!cut && cut.w >= MIN_CUT && cut.h >= MIN_CUT;
  return (
    <Dialog title={t(catalog, 'crop.title')} catalog={catalog} size="huge" onClose={onClose}>
      {pdfs.length === 0 ? (
        <p className="hint">{t(catalog, 'crop.none')}</p>
      ) : (
        <div className="crop">
          <div className="crop-bar">
            {pdfs.length > 1 && (
              <select
                className="crop-file"
                value={file?.path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setPage(firstPage(pdfs.find((f) => f.path === e.target.value)));
                }}
              >
                {pdfs.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.library.manifest.title}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="crop-prev" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label={t(catalog, 'crop.previous')}>
              ◀
            </button>
            <label className="crop-page">
              {t(catalog, 'crop.page')}{' '}
              <input type="number" min={1} max={count} value={page} onChange={(e) => setPage(Math.max(1, Math.min(count, Number(e.target.value) || 1)))} />
              {label(page) !== String(page) && <span className="hint"> ({t(catalog, 'crop.printed', { page: label(page) })})</span>} / {count}
            </label>
            <button type="button" className="crop-next" disabled={page >= count} onClick={() => setPage((p) => Math.min(count, p + 1))} aria-label={t(catalog, 'crop.next')}>
              ▶
            </button>
            <span className="crop-sep" />
            <button type="button" className="crop-zoom-out" disabled={zoom <= ZOOMS[0]!} onClick={() => zoomBy(-1)} aria-label={t(catalog, 'crop.zoomOut')}>
              −
            </button>
            <span className="crop-zoom">{Math.round(zoom * 100)} %</span>
            <button type="button" className="crop-zoom-in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]!} onClick={() => zoomBy(1)} aria-label={t(catalog, 'crop.zoomIn')}>
              +
            </button>
            <button type="button" className="crop-fit" onClick={() => setZoom(1)}>
              {t(catalog, 'crop.fit')}
            </button>
            <span className="hint crop-help">{t(catalog, 'crop.help')}</span>
            {inserted > 0 && <span className="crop-count">{t(catalog, 'crop.inserted', { count: String(inserted) })}</span>}
            <button type="button" className="crop-insert default" disabled={!ready} onClick={() => void insert()}>
              {t(catalog, 'crop.insert')}
            </button>
          </div>
          {failed && <p className="study-advice warn">{failed}</p>}
          <div
            ref={view}
            className="crop-page-view"
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              zoomBy(e.deltaY < 0 ? 1 : -1);
            }}
          >
            <div
              className="crop-surface"
              data-rendered={rendered ? '1' : undefined}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                drag.current = at(e);
                setCut(undefined);
              }}
              onMouseMove={(e) => {
                if (drag.current && e.buttons & 1) setCut(rectFrom(drag.current, at(e)));
              }}
              onMouseUp={(e) => {
                if (drag.current) setCut(rectFrom(drag.current, at(e)));
                drag.current = undefined;
              }}
            >
              <canvas ref={canvas} className="crop-canvas" />
              {cut && <div className="crop-cut" style={{ left: cut.x, top: cut.y, width: cut.w, height: cut.h }} />}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
