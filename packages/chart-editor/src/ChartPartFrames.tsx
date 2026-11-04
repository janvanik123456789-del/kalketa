/**
 * The frames of the texts of a selected chart: they show what can be edited. A frame of a text that can be moved has
 * handles and takes the mouse, so it can be dragged by its whole area; the others let the click through to the text.
 * Over the drawing, not in it: a printout never has them.
 */

import { useEffect, useState, type RefObject } from 'react';
import { partKind, partMoves } from './logic/chartParts.js';

interface Frame {
  readonly part: string;
  /** In the drawing, so the mouse can move it. */
  readonly moves: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const PADDING = 2;

/** Where the texts of the chart stand now, in px of the box of the chart (the page may be zoomed). */
function measure(view: HTMLElement): Frame[] {
  const own = view.getBoundingClientRect();
  if (!(own.width > 0)) return [];
  const scale = view.offsetWidth / own.width;
  const boxes = new Map<string, { moves: boolean; left: number; top: number; right: number; bottom: number }>();
  view.querySelectorAll('.block-view [data-part]').forEach((element) => {
    const part = element.getAttribute('data-part')!;
    if (partKind(part) !== 'text') return;
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 || box.height > 0)) return;
    const seen = boxes.get(part);
    boxes.set(part, {
      moves: partMoves(part) && !!element.closest('svg'),
      left: Math.min(box.left, seen?.left ?? box.left),
      top: Math.min(box.top, seen?.top ?? box.top),
      right: Math.max(box.right, seen?.right ?? box.right),
      bottom: Math.max(box.bottom, seen?.bottom ?? box.bottom),
    });
  });
  return [...boxes].map(([part, box]) => ({
    part,
    moves: box.moves,
    left: Math.round((box.left - own.left) * scale) - PADDING,
    top: Math.round((box.top - own.top) * scale) - PADDING,
    width: Math.round((box.right - box.left) * scale) + 2 * PADDING,
    height: Math.round((box.bottom - box.top) * scale) + 2 * PADDING,
  }));
}

export function ChartPartFrames({ view }: { view: RefObject<HTMLElement | null> }) {
  const [frames, setFrames] = useState<readonly Frame[]>([]);
  // Not a layout effect: the box of the chart is known only after its children have been laid out.
  useEffect(() => {
    const element = view.current;
    const drawing = element?.querySelector('.block-view');
    if (!element || !drawing) return;
    const update = () => {
      const next = measure(element);
      setFrames((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next));
    };
    update();
    // Drawn anew, a text dragged or made bigger: the frames go with it.
    const changes = new MutationObserver(update);
    changes.observe(drawing, { subtree: true, childList: true, attributes: true, attributeFilter: ['transform', 'font-size', 'font-weight', 'font-family', 'font-style'] });
    const size = new ResizeObserver(update);
    size.observe(element);
    return () => {
      changes.disconnect();
      size.disconnect();
    };
  }, [view]);
  return (
    <>
      {frames.map(({ part, moves, left, top, width, height }) => {
        return (
          <span key={part} className={`chart-part-frame${moves ? ' moves' : ''}`} style={{ left, top, width, height }} {...(moves ? { 'data-part': part } : {})}>
            {moves && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => <i key={corner} className={corner} />)}
          </span>
        );
      })}
    </>
  );
}
