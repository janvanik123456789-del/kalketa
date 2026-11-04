/**
 * A chart as printed, and all that can be done to it with the mouse. The pointer over it reads the values: a vertical
 * line at the nearest point and the value of every curve there. A click on a part opens its small window, Shift + wheel
 * zooms, Shift + drag moves what the axes show; handles change its size. Nothing is kept here: all of it is written
 * into the plot line by the functions it is given.
 */

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatDate, formatNumber, t, type Catalog } from '@kalketa/i18n';
import { chartSvg as drawChart, DEFAULT_VIEW, labelParts, partOffset, surfaceAt, viewText, xPosition, xValueAt, yValueAt, type ChartLook } from '@kalketa/chart';
import { renderBlockHtml, type PrintBlock } from '@kalketa/render';
import { axisRangeText, axisValueText, chartX, movedRange, nearestOnCurve, partMoves, seriesAt, withPartChanges, zoomedRange, type AxisRange, type ChartPart } from './logic/index.js';
import { ChartPartFrames } from './ChartPartFrames.js';
import { drawInPlace } from './drawInPlace.js';
import { startEdgeResize, startResize } from './resize.js';

export function ChartView({ ref: holder, block, catalog, uiCatalog, onPart, onLook, onResize, onOption, onOptions, sliders, editable }: { ref?: (element: HTMLDivElement | null) => void; block: Extract<PrintBlock, { kind: 'chart' }>; catalog: Catalog; /** The language of the program: of its windows and hints (catalog is that of the printout). */ uiCatalog: Catalog; /** A click on a part of the chart: its small window. */ onPart(part: ChartPart): void; /** A change of the chart's own look, on its way to the line. */ onLook(change: (look: ChartLook) => ChartLook): void; onResize(width: number, ratio?: number): void; onOption(name: string, value: string | undefined): void; onOptions(options: readonly (readonly [string, string | undefined])[]): void; sliders?: ReactNode; /** A curve that opens to be edited by a click (a fitted one). */ editable?(series: number): boolean }) {
  const [hover, setHover] = useState<{ left: number; top: number; height: number; lines: string[] } | undefined>();
  const [dragged, setDragged] = useState<number | undefined>();
  const view = useRef<HTMLDivElement>(null);
  // The newest function of the row (the line changes as the chart is zoomed): a later write must not work from an old text.
  const writeOptions = useRef(onOptions);
  writeOptions.current = onOptions;
  // What the axes show, ahead of the chart while a zoom waits to be written (a few writes a second, each recalculates).
  const shownRange = useRef<{ x?: AxisRange; y?: AxisRange } | undefined>(undefined);
  const zoomable = !block.xDates && block.spec.kind !== 'surface' && block.spec.kind !== 'map' && block.spec.kind !== 'bar' && !block.spec.surface;
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeRange = () => {
    writeTimer.current = undefined;
    const range = shownRange.current;
    if (!range) return;
    writeOptions.current([
      ...(range.x ? [['xlim', axisRangeText(range.x, block.xUnit, block.layout.x.log)] as const] : []),
      ...(range.y ? [['ylim', axisRangeText(range.y, block.yUnit, block.layout.y.log)] as const] : []),
    ]);
  };
  const askRange = (range: { x?: AxisRange; y?: AxisRange }) => {
    shownRange.current = { ...shownRange.current, ...range };
    writeTimer.current ??= setTimeout(writeRange, 80);
  };
  // A chart drawn anew from its line is what it shows again.
  useEffect(() => {
    if (writeTimer.current === undefined) shownRange.current = undefined;
  });
  // Shift + wheel zooms: over the plot both axes, over an axis that axis alone. The plain wheel stays the page's.
  useEffect(() => {
    const element = view.current;
    if (!element || !zoomable) return;
    const wheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      const svg = element.querySelector('svg.chart-svg');
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const unit = box.width / block.layout.width;
      const [px, py] = [(e.clientX - box.left) / unit, (e.clientY - box.top) / unit];
      const { plot, x, y } = block.layout;
      const overX = px >= plot.left - 4 && px <= plot.right + 4;
      const overY = py >= plot.top - 4 && py <= plot.bottom + 4;
      if (!overX && !overY) return;
      e.preventDefault();
      // Under Shift a wheel may report its turn sideways.
      const factor = (e.deltaY || e.deltaX) < 0 ? 0.8 : 1.25;
      const scaleOf = (s: typeof x, range?: AxisRange) => (range ? { ...s, min: range[0], max: range[1] } : s);
      const now = shownRange.current;
      const xNow = scaleOf(x, now?.x);
      const yNow = scaleOf(y, now?.y);
      const clampShare = (v: number) => Math.min(1, Math.max(0, v));
      const along = (s: typeof x, at: number) => {
        const share = s.reversed ? 1 - at : at;
        return s.log ? s.min * (s.max / s.min) ** share : s.min + share * (s.max - s.min);
      };
      askRange({
        ...(overX ? { x: zoomedRange(xNow, along(xNow, clampShare((px - plot.left) / (plot.right - plot.left))), factor) } : {}),
        ...(overY ? { y: zoomedRange(yNow, along(yNow, clampShare((plot.bottom - py) / (plot.bottom - plot.top))), factor) } : {}),
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [block.layout, zoomable]);
  // The box of the chart carries its width and edge (a row flowed around carries them itself); the chart fills it.
  const { wrap: _w, dx: _x, dy: _y, width: _s, align: _a, ...plain } = block;
  const width = block.wrap ? undefined : (dragged ?? block.width);
  const read = (e: ReactMouseEvent<HTMLDivElement>) => {
    const svg = e.currentTarget.querySelector('svg');
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    // The page may be zoomed: client px -> px of the block -> units of the SVG.
    const own = e.currentTarget.getBoundingClientRect();
    const toBlock = e.currentTarget.offsetWidth / own.width;
    const unit = box.width / block.layout.width;
    const px = (e.clientX - box.left) / unit;
    const { plot } = block.layout;
    // Over a fitted curve the pointer says it can be clicked, and the values below say what for.
    const over = editable ? seriesAt(block, px, (e.clientY - box.top) / unit) : undefined;
    const clickable = over !== undefined && !!editable?.(over);
    e.currentTarget.style.cursor = clickable ? 'pointer' : '';
    const hint = clickable ? [t(catalog, 'fit.clickToEdit', { name: block.spec.series[over!]!.label })] : [];
    if (block.spec.kind === 'surface') {
      e.currentTarget.style.cursor = 'grab';
      return setHover(undefined);
    }
    if (px < plot.left - 4 || px > plot.right + 4) return setHover(undefined);
    const x = xValueAt(block.layout, px);
    const number = (v: number) => formatNumber(v, catalog, { digits: 4 }).replace('-', '−');
    const withUnit = (v: number, u: string) => (Number.isFinite(v) ? `${number(v)}${u ? ` ${u}` : ''}` : '–');
    // Over a map of a surface: x, y where the pointer is and z there, read between the points of its grid.
    const surface = block.spec.surface;
    if (surface) {
      const py = (e.clientY - box.top) / unit;
      if (py < plot.top || py > plot.bottom) return setHover(undefined);
      const y = block.layout.y.min + ((plot.bottom - py) / (plot.bottom - plot.top)) * (block.layout.y.max - block.layout.y.min);
      const name = (title: string, fallback: string) => title.split(' [')[0] || fallback;
      const zUnit = /\[([^\]]*)\]$/.exec(surface.zTitle)?.[1] ?? '';
      return setHover({
        left: (box.left - own.left + xPosition(block.layout, x) * unit) * toBlock,
        top: (box.top - own.top + plot.top * unit) * toBlock,
        height: (plot.bottom - plot.top) * unit * toBlock,
        lines: [`${name(block.spec.xTitle, 'x')} = ${withUnit(x, block.xUnit)}`, `${name(block.spec.yTitle, 'y')} = ${withUnit(y, block.yUnit)}`, `${name(surface.zTitle, 'z')} = ${withUnit(surfaceAt(surface, x, y), zUnit)}`],
      });
    }
    // Over an implicit curve (x² + y² = 25) the pointer reads where it is: x and y.
    if (block.spec.series.some((s) => s.implicit)) {
      const py = (e.clientY - box.top) / unit;
      if (py < plot.top || py > plot.bottom) return setHover(undefined);
      const y = block.layout.y.min + ((plot.bottom - py) / (plot.bottom - plot.top)) * (block.layout.y.max - block.layout.y.min);
      const name = (title: string, fallback: string) => title.split(' [')[0] || fallback;
      return setHover({
        left: (box.left - own.left + xPosition(block.layout, x) * unit) * toBlock,
        top: (box.top - own.top + plot.top * unit) * toBlock,
        height: (plot.bottom - plot.top) * unit * toBlock,
        lines: [`${name(block.spec.xTitle, 'x')} = ${withUnit(x, block.xUnit)}`, `${name(block.spec.yTitle, 'y')} = ${withUnit(y, block.yUnit)}`, ...hint],
      });
    }
    const near = block.spec.series[0]!.xs.reduce((best, v, i, xs) => (Math.abs(v - x) < Math.abs(xs[best]! - x) ? i : best), 0);
    const at = block.spec.series[0]!.xs[near]!;
    const xText = block.xDates ? formatDate(at, catalog) : withUnit(at, block.xUnit);
    const head = block.spec.xTitle.split(' [')[0] || '#';
    const lines = [`${head} = ${xText}`, ...block.spec.series.map((s) => `${s.label} = ${withUnit(s.ys[s.xs.indexOf(at)] ?? NaN, block.yUnit)}`)];
    setHover({
      left: (box.left - own.left + xPosition(block.layout, at) * unit) * toBlock,
      top: (box.top - own.top + plot.top * unit) * toBlock,
      height: (plot.bottom - plot.top) * unit * toBlock,
      lines: [...lines, ...hint],
    });
  };
  /**
   * A surface in 3D turned by dragging: left and right round the vertical, up and down the height of the eye.
   * Drawn anew as the pointer moves; where it stops is written into the line (view: "az=… el=…").
   */
  const turnSurface = (e: ReactPointerEvent<HTMLDivElement>, surface: NonNullable<typeof block.spec.surface>) => {
    e.preventDefault();
    e.stopPropagation();
    const holder = document.documentElement;
    const pointer = e.pointerId;
    try {
      holder.setPointerCapture(pointer);
    } catch {
      // Without capture the moves come to the window as long as the element stays.
    }
    const own = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    const from = surface.view ?? DEFAULT_VIEW;
    let view = from;
    let frame: number | undefined;
    const number = (v: number) => formatNumber(v, catalog, { digits: 4 }).replace('-', '−');
    const draw = () => {
      frame = undefined;
      const svg = own.querySelector('svg.chart-svg');
      if (!svg) return;
      svg.outerHTML = drawChart({ ...block.spec, surface: { ...surface, view } }, { width: block.layout.width, height: block.layout.height, look: block.look, format: number });
    };
    const move = (ev: PointerEvent) => {
      view = { az: Math.round(from.az - (ev.clientX - start.x) * 0.5), el: Math.round(Math.max(0, Math.min(90, from.el + (ev.clientY - start.y) * 0.4))) };
      frame ??= requestAnimationFrame(draw);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try {
        holder.releasePointerCapture(pointer);
      } catch {
        // Released already.
      }
      if (view.az !== from.az || view.el !== from.el) onOption('view', `"${viewText(view)}"`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // The point of the tangent dragged along the curve; a label dragged off it. Both written into the line.
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    // A title under a handle of the selected chart (the y title written upwards lies under the left one) is taken, not the handle.
    // The title itself: its frame reaches further and would take the handle's place.
    const pressed = e.target as Element;
    const under = pressed.closest?.('.picture-handle') ? document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.closest('svg.chart-svg') && partMoves(el.closest('[data-part]')?.getAttribute('data-part') ?? '')) : undefined;
    const target = under ?? pressed;
    const handle = target.closest?.('[data-chart-drag="tangent"]');
    const labelEl = target.closest?.('[data-label]');
    const lineHandle = target.closest?.('[data-chart-drag="ref"], [data-chart-drag="cursor"]');
    // A part of the chart: a click opens its small window, a drag moves it where it can be moved. A fitted curve opens its fit as before.
    const partEl = e.button === 0 && !e.shiftKey && !handle && !labelEl && !lineHandle && block.spec.kind !== 'surface' ? target.closest?.('[data-part]') : null;
    const partName = partEl?.getAttribute('data-part') ?? undefined;
    const fitted = partName !== undefined && /^s\d+$/.test(partName) && !!editable?.(Number(partName.slice(1)));
    if (partName && !fitted) {
      e.preventDefault();
      e.stopPropagation();
      const drawn = e.currentTarget.querySelector(`svg.chart-svg [data-part="${partName}"]`);
      const moves = partMoves(partName) && !!drawn;
      const start = { x: e.clientX, y: e.clientY };
      const [ox, oy] = partOffset(block.look, partName);
      const holder = e.currentTarget;
      const size = () => (holder.querySelector('svg.chart-svg')?.getBoundingClientRect().width ?? 0) / block.layout.width;
      // The part itself follows the pointer; only where it stops is written (a write recalculates the sheet).
      // Pressed on its frame or on it, it is the text of the drawing that moves.
      const own = drawn?.getAttribute('transform') ?? '';
      let dragged = false;
      let at = '';
      const move = (ev: PointerEvent) => {
        const u = size();
        if (!moves || !(u > 0) || (!dragged && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4)) return;
        dragged = true;
        const [dx, dy] = [(ev.clientX - start.x) / u, (ev.clientY - start.y) / u];
        drawn!.setAttribute('transform', `translate(${dx} ${dy}) ${own}`.trim());
        at = `${Math.round(ox + dx)},${Math.round(oy + dy)}`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (dragged) onLook((look) => withPartChanges(look, partName, { at }));
        else onPart(partName);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    const surface = block.spec.kind === 'surface' ? block.spec.surface : undefined;
    if (surface && e.button === 0 && target.closest?.('svg.chart-svg')) return turnSurface(e, surface);
    // Shift + drag moves what the axes show, as far as the plot goes.
    const panning = e.shiftKey && e.button === 0 && zoomable && !!target.closest?.('svg.chart-svg');
    if (!handle && !labelEl && !lineHandle && !panning) return;
    // No mousedown follows (the row would take the chart to move it), and the pointer is held by the page:
    // the chart is drawn anew as the point moves, and the element pressed is gone, yet the moves still come.
    e.preventDefault();
    e.stopPropagation();
    const pointer = e.pointerId;
    const holder = document.documentElement;
    try {
      holder.setPointerCapture(pointer);
    } catch {
      // Without capture the moves come to the window as long as the element stays.
    }
    const release = () => {
      try {
        holder.releasePointerCapture(pointer);
      } catch {
        // Released already.
      }
    };
    // The chart is drawn anew as the line changes: its picture is looked up at every move, never kept
    // (an old one, taken out of the page, measures 0 × 0 and every position on it is wrong).
    // Found by its line in the page as it is now: the chart may move to another page and be made anew.
    // The same chart while it stays in the page; made anew (on another page), found again by its line in the same layer.
    const view = e.currentTarget;
    const layer = view.closest('.layer-view');
    const chartSvg = () =>
      view.isConnected ? view.querySelector('svg.chart-svg') : (layer?.isConnected ? layer : document).querySelector(`.row[data-line="${block.line}"] svg.chart-svg`);
    if (!chartSvg()) return;
    const unit = () => (chartSvg()?.getBoundingClientRect().width ?? 0) / block.layout.width;
    if (panning) {
      const { plot, x, y } = block.layout;
      const start = { x: e.clientX, y: e.clientY };
      const move = (ev: PointerEvent) => {
        const u = unit();
        if (!(u > 0)) return;
        // Taken by the hand: the content follows the pointer, so the range goes the other way.
        askRange({
          x: movedRange(x, ((x.reversed ? 1 : -1) * (ev.clientX - start.x)) / u / (plot.right - plot.left)),
          y: movedRange(y, ((y.reversed ? -1 : 1) * (ev.clientY - start.y)) / u / (plot.bottom - plot.top)),
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        release();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (lineHandle) {
      // A reference line or a cursor follows the pointer, drawn from what the chart holds; only where it stops is written.
      const refIndex = lineHandle.getAttribute('data-ref');
      const refAt = refIndex === null ? -1 : Number(refIndex);
      const refAxis = block.spec.refs?.[refAt]?.axis;
      const cursor = lineHandle.getAttribute('data-cursor');
      const { x: xs, y: ys } = block.layout;
      const spanX = xs.log ? 0 : xs.max - xs.min;
      const spanY = ys.log ? 0 : ys.max - ys.min;
      let frame: number | undefined;
      let pending: readonly [string, string] | undefined;
      let shown = block.spec;
      const withRef = (at: number) => ({ ...block.spec, refs: block.spec.refs!.map((line, i) => (i === refAt ? { ...line, at } : line)) });
      const move = (ev: PointerEvent) => {
        const box = chartSvg()?.getBoundingClientRect();
        const u = unit();
        if (!box || !(u > 0)) return;
        const { plot } = block.layout;
        const px = Math.min(plot.right, Math.max(plot.left, (ev.clientX - box.left) / u));
        const py = Math.min(plot.bottom, Math.max(plot.top, (ev.clientY - box.top) / u));
        if (refAxis === 'y') {
          const v = yValueAt(block.layout, py);
          pending = ['hline', axisValueText(v, spanY || v, block.yUnit)];
          shown = withRef(v);
        } else if (refAxis === 'x') {
          const v = xValueAt(block.layout, px);
          pending = ['vline', axisValueText(v, spanX || v, block.xUnit)];
          shown = withRef(v);
        } else if (cursor !== null && block.spec.cursors) {
          const v = xValueAt(block.layout, px);
          const other = cursor === '0' ? block.spec.cursors.to : block.spec.cursors.from;
          // The two may cross: the range stays from the lower to the higher (never empty).
          if (v === other) return;
          pending = ['cursors', axisRangeText([Math.min(v, other), Math.max(v, other)], block.xUnit, xs.log)];
          shown = { ...block.spec, cursors: { ...block.spec.cursors, from: Math.min(v, other), to: Math.max(v, other) } };
        }
        frame ??= requestAnimationFrame(() => {
          frame = undefined;
          drawInPlace(view, block, catalog, block.look, shown);
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        release();
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (pending) writeOptions.current([pending]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    if (handle) {
      // Written as it moves, a few times a second (each write recalculates the chart), and where it stops.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let last: string | undefined;
      let pending: string | undefined;
      const flush = () => {
        timer = undefined;
        if (pending !== undefined) onOption('tangent', pending);
        pending = undefined;
      };
      const move = (ev: PointerEvent) => {
        const box = chartSvg()?.getBoundingClientRect();
        const u = unit();
        if (!box || !(u > 0)) return;
        const x = nearestOnCurve(block, (ev.clientX - box.left) / u, (ev.clientY - box.top) / u);
        if (x === undefined || !Number.isFinite(x)) return;
        const value = chartX(block, x);
        if (value === last) return;
        last = value;
        pending = value;
        timer ??= setTimeout(flush, 60);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        release();
        if (timer) clearTimeout(timer);
        flush();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    const key = labelEl!.getAttribute('data-label')!;
    const [ox, oy] = block.spec.labelOffsets?.[key] ?? [0, 0];
    const start = { x: e.clientX, y: e.clientY };
    let delta = [0, 0];
    const move = (ev: PointerEvent) => {
      const u = unit();
      if (!(u > 0)) return;
      delta = [(ev.clientX - start.x) / u, (ev.clientY - start.y) / u];
      labelEl!.setAttribute('transform', `translate(${delta[0]} ${delta[1]})`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      release();
      if (Math.hypot(delta[0]!, delta[1]!) < 2) return;
      const offsets = { ...(block.spec.labelOffsets ?? {}), [key]: [Math.round(ox + delta[0]!), Math.round(oy + delta[1]!)] as const };
      const text = Object.entries(offsets)
        .filter(([, [x, y]]) => x || y)
        .map(([k, [x, y]]) => `${k}=${x},${y}`)
        .join(' ');
      onOption('labels', text ? `"${text}"` : undefined);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      ref={(element) => {
        view.current = element;
        holder?.(element);
      }}
      className={`chart-view${block.align && !block.wrap ? ` align-${block.align}` : ''}`}
      style={width !== undefined ? { width: `${width}%` } : undefined}
      {...(zoomable ? { title: t(uiCatalog, 'chart.viewHint') } : {})}
      onPointerDownCapture={startDrag}
      // A double click into the plot area: the grid and the background. On a part it stays with the part's window: the
      // row around the chart would open its line, which only the margin of the chart does.
      onDoubleClickCapture={(e) => {
        const svg = view.current?.querySelector('svg.chart-svg');
        if (!svg || block.spec.kind === 'surface') return;
        if ((e.target as Element).closest?.('[data-part]')) return e.stopPropagation();
        const box = svg.getBoundingClientRect();
        const unit = box.width / block.layout.width;
        const [px, py] = [(e.clientX - box.left) / unit, (e.clientY - box.top) / unit];
        const { plot } = block.layout;
        if (px < plot.left || px > plot.right || py < plot.top || py > plot.bottom) return;
        e.stopPropagation();
        onPart('grid');
      }}
      onMouseMove={read}
      onMouseLeave={() => setHover(undefined)}
    >
      <div className="block-view" dangerouslySetInnerHTML={{ __html: renderBlockHtml(plain, catalog, { defineOperator: '≔' }) }} />
      <ChartPartFrames view={view} />
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <span
          key={corner}
          className={`picture-handle ${corner}`}
          title={t(catalog, 'editor.pictureResize')}
          onMouseDown={(e) => view.current && startResize(e, view.current, block, block.width, setDragged, (w) => (setDragged(undefined), w !== block.width && onResize(w)))}
        />
      ))}
      {/* The edges: the width alone (the height stays) or the height alone. */}
      {(['n', 's', 'e', 'w'] as const).map((edge) => (
        <span
          key={edge}
          className={`picture-handle edge ${edge}`}
          title={t(catalog, edge === 'n' || edge === 's' ? 'editor.resizeHeight' : 'editor.resizeWidth')}
          onMouseDown={(e) =>
            view.current &&
            startEdgeResize(e, view.current, block, edge, setDragged, (size) => {
              setDragged(undefined);
              onResize(size.width, Math.round((size.heightPx / size.widthPx) * 100) / 100);
            })
          }
        />
      ))}
      {sliders}
      {dragged !== undefined && <span className="picture-size">{dragged} %</span>}
      {hover && (
        <>
          <div className="chart-crosshair" style={{ left: hover.left, top: hover.top, height: hover.height }} />
          <div className={`chart-tooltip${hover.left > 360 ? ' left' : ''}`} style={{ left: hover.left, top: hover.top }}>
            {hover.lines.map((l, i) => (
              <div key={i}>
                {labelParts(l).map((p, j) => (p.sub ? <sub key={j}>{p.text}</sub> : p.text))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
