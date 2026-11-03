/**
 * What a chart needs to outlast its row. A row is made anew when its text changes, a chart with it, so what must survive
 * lives with whoever holds the rows: the row of each chart as it is now (a write never works from an old text), the look
 * on its way to the line, and the small window of a part.
 */

import { useRef, useState, type ReactNode } from 'react';
import type { Catalog } from '@kalketa/i18n';
import { chartLookText, withLook, type ChartLook } from '@kalketa/chart';
import type { PrintBlock } from '@kalketa/render';
import { ChartPartPanel } from './ChartPartPanel.js';
import { withoutPart, withPartChanges, withPlotOption, type ChartPart } from './logic/index.js';

type ChartBlock = Extract<PrintBlock, { kind: 'chart' }>;
/** A plot line of the sheet: where it stands and its text. */
export interface ChartLine {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
type Options = readonly (readonly [string, string | undefined])[];

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

export function useChartEditing({ catalog, fonts, onReplace }: { catalog: Catalog; fonts: readonly string[]; onReplace(start: number, end: number, text: string): void }): ChartEditing {
  const rows = useRef(new Map<number, { line: ChartLine; block: ChartBlock; view: HTMLElement | null }>()).current;
  const pendingLooks = useRef(new Map<number, ChartLook>()).current;
  const [open, setOpen] = useState<{ line: number; part: ChartPart } | undefined>();
  const writeRef = useRef<(line: number, options: Options) => void>(() => undefined);

  const write = (line: number, options: Options) => {
    const row = rows.get(line);
    if (row) onReplace(row.line.start, row.line.end, options.reduce((text, [name, value]) => withPlotOption(text, name, value), row.line.text));
  };
  writeRef.current = write;
  const lookOf = (line: number): ChartLook => pendingLooks.get(line) ?? rows.get(line)?.block.ownLook ?? {};
  const changeLook = (line: number, change: (look: ChartLook) => ChartLook) => {
    const waiting = pendingLooks.has(line);
    pendingLooks.set(line, change(lookOf(line)));
    if (waiting) return;
    setTimeout(() => {
      const look = pendingLooks.get(line);
      pendingLooks.delete(line);
      const text = look ? chartLookText(look) : '';
      writeRef.current(line, [['style', text ? `"${text}"` : undefined]]);
    }, 50);
  };

  const row = open && rows.get(open.line);
  const panel =
    open && row ? (
      <ChartPartPanel
        key={`${open.line}:${open.part}`}
        catalog={catalog}
        fonts={fonts}
        part={open.part}
        spec={row.block.spec}
        look={withLook(row.block.look, lookOf(open.line))}
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
    ) : null;

  return {
    register: (line, block) => {
      rows.set(block.line, { line, block, view: rows.get(block.line)?.view ?? null });
    },
    viewProps: (line, block) => ({
      ref: (element) => {
        const own = rows.get(block.line);
        if (element && own) own.view = element;
      },
      onPart: (part) => setOpen({ line: block.line, part }),
      onLook: (change) => changeLook(block.line, change),
      onOption: (name, value) => onReplace(line.start, line.end, withPlotOption(line.text, name, value)),
      onOptions: (options) => write(block.line, options),
    }),
    panel,
  };
}
