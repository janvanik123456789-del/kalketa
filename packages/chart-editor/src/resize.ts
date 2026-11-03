/**
 * The handles of a box on a page (a chart, a picture, a canvas) dragged: the width as a share of the text,
 * or one edge alone.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * An edge of a chart or a canvas dragged: the side ones change the width alone (the height
 * stays as it is), the top and bottom ones the height alone. A centred one grows on both
 * sides, one at an edge from that edge. Shown while dragging as the box it will have.
 */
export function startEdgeResize(
  e: ReactMouseEvent,
  element: HTMLElement,
  place: { readonly side?: 'left' | 'right'; readonly wrap?: 'left' | 'right'; readonly align?: 'left' | 'right' },
  edge: 'n' | 's' | 'e' | 'w',
  live: (width: number) => void,
  done: (size: { width: number; widthPx: number; heightPx: number }, before: { widthPx: number; heightPx: number }) => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const body = element.closest('.page-body');
  if (!body) return;
  const rect = element.getBoundingClientRect();
  const bodyBox = body.getBoundingClientRect();
  const at = place.side ?? place.wrap ?? place.align;
  const before = { widthPx: rect.width, heightPx: rect.height };
  let size = { width: Math.round((rect.width / bodyBox.width) * 100), widthPx: rect.width, heightPx: rect.height };
  const outline = document.createElement('div');
  outline.className = 'resize-outline';
  document.body.appendChild(outline);
  const show = () => {
    const left = at === 'right' ? rect.right - size.widthPx : at === 'left' ? rect.left : rect.left + rect.width / 2 - size.widthPx / 2;
    const top = edge === 'n' ? rect.bottom - size.heightPx : rect.top;
    Object.assign(outline.style, { left: `${left}px`, top: `${top}px`, width: `${size.widthPx}px`, height: `${size.heightPx}px` });
  };
  show();
  const move = (event: MouseEvent) => {
    if (edge === 'e' || edge === 'w') {
      const centre = rect.left + rect.width / 2;
      const span = at === 'right' ? rect.right - event.clientX : at === 'left' ? event.clientX - rect.left : 2 * Math.abs(event.clientX - centre);
      const width = Math.max(10, Math.min(100, Math.round((span / bodyBox.width) * 100)));
      size = { width, widthPx: (width / 100) * bodyBox.width, heightPx: rect.height };
      live(width);
    } else {
      const heightPx = Math.max(20, edge === 's' ? event.clientY - rect.top : rect.bottom - event.clientY);
      size = { ...size, heightPx };
    }
    show();
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    outline.remove();
    done(size, before);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/**
 * A corner handle of a picture or a chart dragged: the width as a share of the
 * text width. A centred one grows on both sides, one at an edge from that edge;
 * a row flowed around or a side column follows while dragging.
 */
export function startResize(
  e: ReactMouseEvent,
  element: HTMLElement,
  place: { readonly side?: 'left' | 'right'; readonly wrap?: 'left' | 'right'; readonly align?: 'left' | 'right' },
  width: number | undefined,
  live: (width: number) => void,
  done: (width: number) => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const body = element.closest('.page-body');
  if (!body) return;
  const rect = element.getBoundingClientRect();
  const centre = rect.left + rect.width / 2;
  const bodyBox = body.getBoundingClientRect();
  const bodyWidth = bodyBox.width;
  const at = place.side ?? place.wrap ?? place.align;
  const edge = at === 'right' ? bodyBox.right : at === 'left' ? bodyBox.left : undefined;
  const group = element.closest<HTMLElement>('.side-group');
  const floating = place.wrap ? element.closest<HTMLElement>('.row') : null;
  let current = width ?? Math.round((rect.width / bodyWidth) * 100);
  const move = (event: MouseEvent) => {
    const span = edge === undefined ? 2 * Math.abs(event.clientX - centre) : Math.abs(event.clientX - edge);
    current = Math.max(10, Math.min(edge === undefined || place.align ? 100 : 70, Math.round((span / bodyWidth) * 100)));
    group?.style.setProperty('--side', `${current}%`);
    if (floating) floating.style.width = `${current}%`;
    live(current);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    done(current);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
