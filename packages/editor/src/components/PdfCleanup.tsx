/**
 * "Tidy text from a PDF": shows what the cleanup would do before anything
 * changes (docs/01-filozofie.md, ch. 9.6: a person confirms it). Lines that
 * look like remains of figures are listed with a tick to remove them; words
 * put together from spaced-out letters are highlighted in the preview, since
 * a one-letter preposition may have been glued to one.
 */
import { useMemo, useState } from 'react';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { NOTES_CSS, notesHtml } from '@kalketa/render';
import { applySuspects, cleanPdfText } from '../logic/pdfText.js';
import { Dialog } from './Dialogs.js';

/** Joined words marked in the preview HTML, outside tags only. */
function markWords(html: string, words: readonly string[]): string {
  if (words.length === 0) return html;
  const escaped = [...new Set(words)].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}])(${escaped.join('|')})(?![\\p{L}])`, 'gu');
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : part.replace(pattern, '<mark class="joined">$1</mark>')))
    .join('');
}

export function PdfCleanupDialog({ catalog, text, resolveFile, onApply, onClose }: { catalog: Catalog; text: string; resolveFile: (path: string) => string | undefined; onApply(text: string): void; onClose(): void }) {
  const cleaned = useMemo(() => cleanPdfText(text), [text]);
  // Remains of figures are ticked to go (the user unticks what is real text); formulas stay unless ticked.
  const [drop, setDrop] = useState<ReadonlySet<number>>(() => new Set(cleaned.suspects.flatMap((s, i) => (s.kind === 'scraps' ? [i] : []))));
  const toggle = (i: number, on: boolean) =>
    setDrop((d) => {
      const next = new Set(d);
      if (on) next.add(i);
      else next.delete(i);
      return next;
    });
  const list = (kind: 'scraps' | 'formula', heading: UiKey) =>
    cleaned.suspects.some((s) => s.kind === kind) && (
      <div className={`pdf-suspects ${kind}`}>
        <h4>{t(catalog, heading)}</h4>
        {cleaned.suspects.map((s, i) =>
          s.kind === kind ? (
            <label key={i} className="pdf-suspect">
              <input type="checkbox" checked={drop.has(i)} onChange={(e) => toggle(i, e.target.checked)} /> <code>{s.text}</code>
            </label>
          ) : null,
        )}
      </div>
    );
  const result = applySuspects(cleaned, drop);
  const s = cleaned.stats;

  return (
    <Dialog title={t(catalog, 'pdf.title')} catalog={catalog} wide onClose={onClose} onOk={() => (onApply(result), onClose())}>
      <div className="pdf-cleanup">
        <p className="pdf-summary">
          {t(catalog, 'pdf.summary', {
            joined: String(s.joined),
            paragraphs: String(s.paragraphs),
            words: String(s.words),
            headings: String(s.headings),
            pages: String(s.pageNumbers),
            captions: String(s.captions),
          })}
        </p>
        {s.words > 0 && <p className="hint">{t(catalog, 'pdf.wordsHint')}</p>}
        {list('scraps', 'pdf.suspects')}
        {list('formula', 'pdf.formulas')}
        <h4>{t(catalog, 'pdf.preview')}</h4>
        <div className="pdf-preview page-like">
          <style>{NOTES_CSS}</style>
          <div className="notes" dangerouslySetInnerHTML={{ __html: markWords(notesHtml(result, { resolveFile }), cleaned.joinedWords) }} />
        </div>
      </div>
    </Dialog>
  );
}
