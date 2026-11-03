/**
 * What a chart needs to outlast its row. A row is made anew when its text changes, a chart with it, so what must survive
 * lives with whoever holds the rows: the row of each chart as it is now (a write never works from an old text), the look
 * on its way to the line, and the small window of a part.
 *
 * A change of the look is drawn at once and written into the line when the changes stop: a write recalculates the sheet,
 * and of a long sheet later than it is written. So the look is kept until the chart comes back with it.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Catalog } from '@kalketa/i18n';
import { chartLookText, lookDifference, withLook, type ChartLook } from '@kalketa/chart';
import type { PrintBlock } from '@kalketa/render';
import { ChartPartPanel } from './ChartPartPanel.js';
import { drawInPlace } from './drawInPlace.js';
import { withoutPart, withPartChanges, withPlotOption, type ChartPart } from './logic/index.js';

type ChartBlock = Extract<PrintBlock, { kind: 'chart' }>;
/** A plot line of the sheet: where it stands and its text. */
export interface ChartLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
type Options = readonly (readonly [string, string | undefined])[];

/** How long the changes must stop before the look is written. */
const WRITE_AFTER_MS = 250;
/** How long a written look is kept if the chart never comes back with it (a part of it refused). */
const KEEP_WRITTEN_MS = 10_000;

/** The look of a chart with its own look replaced: what it had of its own is gone (a part taken back to its default). */
const lookWith = (block: ChartBlock, own: ChartLook) => withLook(block.ownLook ? lookDifference(block.look, block.ownLook) : block.look, own);

/** The small window, drawn again by itself as the look changes: nothing around it needs to be. */
function PanelHost({ redraw, render }: { redraw: { current(): void }; render(): ReactNode }) {
  const [, setTurn] = useState(0);
  useEffect(() => {
    redraw.current = () => setTurn((turn) => turn + 1);
    return () => {
      redraw.current = () => undefined;
    };
  }, [redraw]);
  return render();
}

export interface ChartEditing {
  /** To be called for each chart as its row is drawn. */
  register(line: ChartLine, block: ChartBlock): void;
  /** What the ChartView of this chart is given. */
  viewProps(line: ChartLine, block: ChartBlock): {
    ref(element: HTMLDivElement | null): void;
    onPart(part: ChartPart): void;
    onLook(change: (look: ChartLook) => ChartLook): void;
    onOption(name: string, value: string | undefined): void;
    onOptions(options: Options): void;
  };
  /** The small window, to be drawn once beside the rows. */
  readonly panel: ReactNode;
}

export function useChartEditing({ catalog, printCatalog, fonts, onReplace }: { catalog: Catalog; /** The language the chart itself is drawn in. */ printCatalog: Catalog; fonts: readonly string[]; onReplace(start: number, end: number, text: string): void }): ChartEditing {
  const rows = useRef(new Map<number, { line: ChartLine; block: ChartBlock; view: HTMLElement | null }>()).current;
  const pendingLooks = useRef(new Map<number, ChartLook>()).current;
  const writeTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>()).current;
  const redrawPanel = useRef<() => void>(() => undefined);
  const [open, setOpen] = useState<{ line: number; part: ChartPart } | undefined>();
  const writeRef = useRef<(line: number, options: Options) => void>(() => undefined);

  const write = (line: number, options: Options) => {
    const row = rows.get(line);
    if (row) onReplace(row.line.start, row.line.end, options.reduce((text, [name, value]) => withPlotOption(text, name, value), row.line.text));
  };
  writeRef.current = write;
  const lookOf = (line: number): ChartLook => pendingLooks.get(line) ?? rows.get(line)?.block.ownLook ?? {};
  const changeLook = (line: number, change: (look: ChartLook) => ChartLook) => {
    const look = change(lookOf(line));
    pendingLooks.set(line, look);
    const row = rows.get(line);
    if (row) drawInPlace(row.view, row.block, printCatalog, lookWith(row.block, look));
    redrawPanel.current();
    clearTimeout(writeTimers.get(line));
    writeTimers.set(
      line,
      setTimeout(() => {
        const text = chartLookText(pendingLooks.get(line) ?? {});
        writeRef.current(line, [['style', text ? `"${text}"` : undefined]]);
        writeTimers.set(
          line,
          setTimeout(() => pendingLooks.delete(line), KEEP_WRITTEN_MS),
        );
      }, WRITE_AFTER_MS),
    );
  };

  const row = open && rows.get(open.line);
  const panel =
    open && row ? (
      <PanelHost
        key={`${open.line}:${open.part}`}
        redraw={redrawPanel}
        render={() => (
      <ChartPartPanel
        catalog={catalog}
        fonts={fonts}
        part={open.part}
        spec={row.block.spec}
        look={lookWith(row.block, lookOf(open.line))}
        anchor={() => {
          const view = rows.get(open.line)?.view;
          return view?.querySelector(`svg.chart-svg [data-part="${open.part}"]`) ?? view?.querySelector('svg.chart-svg') ?? null;
        }}
        onSet={(changes) => changeLook(open.line, (look) => withPartChanges(look, open.part, changes))}
        onLook={(change) => changeLook(open.line, (look) => ({ ...look, ...change }))}
        {...(open.part === 'xTitle' || open.part === 'yTitle' ? { onTitle: (text: string) => write(open.line, [[open.part === 'xTitle' ? 'xlabel' : 'ylabel', text.trim() ? `"${text.trim().replace(/"/g, '')}"` : undefined]]) } : {})}
        onReset={() => changeLook(open.line, (look) => withoutPart(look, open.part))}
        onClose={() => setOpen(undefined)}
      />
        )}
      />
    ) : null;

  return {
    register: (line, block) => {
      rows.set(block.line, { line, block, view: rows.get(block.line)?.view ?? null });
      // The chart is back with the look written: from here on it speaks for itself.
      const look = pendingLooks.get(block.line);
      if (look && chartLookText(look) === chartLookText(block.ownLook ?? {})) {
        pendingLooks.delete(block.line);
        clearTimeout(writeTimers.get(block.line));
        writeTimers.delete(block.line);
      }
    },
    viewProps: (line, block) => ({
      ref: (element) => {
        const own = rows.get(block.line);
        if (element && own) own.view = element;
        // Made anew from a line older than the look on its way: it shows that look, not a step back.
        const look = pendingLooks.get(block.line);
        if (element && own && look) drawInPlace(element, own.block, printCatalog, lookWith(own.block, look));
      },
      onPart: (part) => setOpen({ line: block.line, part }),
      onLook: (change) => changeLook(block.line, change),
      onOption: (name, value) => onReplace(line.start, line.end, withPlotOption(line.text, name, value)),
      onOptions: (options) => write(block.line, options),
    }),
    panel,
  };
}
