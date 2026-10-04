/**
 * A cut-out from a study PDF (docs/01-filozofie.md, ch. 9.6): the text a PDF
 * gives loses its pictures and turns formulas into scraps, so the page is shown
 * as it is printed and the user drags a rectangle around a picture, formula or
 * table; it goes into the sources as a picture, captioned with its page.
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

interface Props {
  readonly catalog: Catalog;
  /** The study PDFs of the theory folders. */
  readonly files: readonly FoundLibrary[];
  readonly sheetPath?: string;
  onInsert(picture: IncomingPicture, caption: string): void;
  onClose(): void;
}

/** The cut-out is drawn this many times sharper than the page on screen. */
const SHARPER = 2.5;
/** A cut-out smaller than this (CSS pixels) is taken for a slip of the mouse. */
const MIN_CUT = 6;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function PdfCropDialog({ catalog, files, sheetPath, onInsert, onClose }: Props) {
  const pdfs = files.filter((f) => f.study?.content.kind === 'pdf');
  const [path, setPath] = useState(pdfs[0]?.path);
  const file = pdfs.find((f) => f.path === path) ?? pdfs[0];
  const count = file?.study?.content.pages.length ?? 0;
  // The first page the file's card chooses, else the first page.
  const firstPage = (f: FoundLibrary | undefined) => (f?.study ? (selectedPages(f.study.content, f.study.settings)[0] ?? 1) : 1);
  const [page, setPage] = useState(() => firstPage(file));
  const [failed, setFailed] = useState<string>();
  const [cut, setCut] = useState<Rect>();
  const [rendered, setRendered] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
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

  // Draws the page to fit the width of the dialog.
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
        const width = target.parentElement?.clientWidth ?? 760;
        const base = pdfPage.getViewport({ scale: 1 });
        scale.current = width / base.width;
        const ratio = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale: scale.current * ratio });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.width = `${Math.floor(viewport.width / ratio)}px`;
        target.style.height = `${Math.floor(viewport.height / ratio)}px`;
        await pdfPage.render({ canvas: target, viewport }).promise;
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
  }, [file?.path, page]);

  const at = (e: ReactMouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  /** The cut-out drawn sharper than on screen, as a PNG. */
  const insert = async () => {
    if (!file || !cut) return;
    try {
      await cutOut(file, cut);
    } catch (error) {
      setFailed(t(catalog, 'crop.failed', { error: error instanceof Error ? error.message : String(error) }));
    }
  };
  const cutOut = async (file: FoundLibrary, cut: Rect) => {
    const doc = await open(file);
    const pdfPage = await doc.getPage(page);
    const sharp = scale.current * SHARPER;
    const viewport = pdfPage.getViewport({ scale: sharp });
    const whole = document.createElement('canvas');
    whole.width = Math.floor(viewport.width);
    whole.height = Math.floor(viewport.height);
    // As for print: drawn at once, not frame by frame, which waits while the window is in the background.
    await pdfPage.render({ canvas: whole, viewport, intent: 'print' }).promise;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(cut.w * SHARPER));
    out.height = Math.max(1, Math.round(cut.h * SHARPER));
    out.getContext('2d')!.drawImage(whole, cut.x * SHARPER, cut.y * SHARPER, out.width, out.height, 0, 0, out.width, out.height);
    // At once, not through toBlob, whose answer can wait while the window is in the background.
    const bytes = Uint8Array.from(atob(out.toDataURL('image/png').split(',')[1] ?? ''), (c) => c.charCodeAt(0));
    const label = file.study?.content.labels?.[page - 1] ?? String(page);
    onInsert({ name: `vyrez-s${label}.png`, type: 'image/png', bytes }, t(catalog, 'crop.caption', { title: file.library.manifest.title, page: label }));
  };

  const label = (p: number) => file?.study?.content.labels?.[p - 1] ?? String(p);
  return (
    <Dialog title={t(catalog, 'crop.title')} catalog={catalog} wide onClose={onClose} {...(cut && cut.w >= MIN_CUT && cut.h >= MIN_CUT ? { onOk: () => void insert() } : {})}>
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
            <span className="hint crop-help">{t(catalog, 'crop.help')}</span>
          </div>
          {failed && <p className="study-advice warn">{failed}</p>}
          <div className="crop-page-view">
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
