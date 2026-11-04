/**
 * The menu of a chart under the right button: what it marks, its axes, reference lines, the hatched area, the tangent.
 * All of it options of the plot line. The items are of the shape of the program's menus, which show them.
 */

import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import { fromDecimalComma, toDecimalComma } from '@kalketa/core';
import { chartLookText, xPosition } from '@kalketa/chart';
import type { PrintBlock } from '@kalketa/render';
import { chartX, nearestOnCurve, plotFlag, plotOption, plotShowsRoots, plotYRange, withNewNote, withPlotFlag, withPlotOption, withPlotRoots, withPlotYRange, writtenNumber } from './logic/index.js';

export type ChartMenuItem =
  | { readonly kind: 'separator' }
  | { readonly kind: 'submenu'; readonly label: string; readonly items: readonly ChartMenuItem[] }
  | { readonly kind: 'action'; readonly label: string; readonly checked?: boolean; run(): void };

/** The chart and what the menu needs of the program around it. */
export interface ChartMenuHost {
  /** The program's language. */
  readonly catalog: Catalog;
  readonly decimalComma: boolean;
  /** The plot line as it is now, and how it is replaced. */
  readonly text: string;
  write(text: string): void;
  /** The chart as drawn; none while its line has an error. */
  readonly block: Extract<PrintBlock, { kind: 'chart' }> | undefined;
  /** The integrals of the sheet, which the hatched area can take its bounds, name and value from. */
  readonly integrals: readonly { readonly name: string; readonly text: string }[];
  /** Asks for a short text; undefined when cancelled. */
  ask(question: string, initial: string): Promise<string | undefined>;
  /** The window of the look of the whole chart. */
  onLook?(chart: Extract<PrintBlock, { kind: 'chart' }>, write: (style: string | undefined) => void): void;
}

export function chartMenuItems(host: ChartMenuHost): ChartMenuItem[] {
  /** The x axis, the words of the axes, logarithmic axes, reference lines and the measuring between two places: options of the plot line. */
  const chartAxisItems = (): ChartMenuItem[] => {
    const c = host.catalog;
    const shown = (text: string) => (host.decimalComma ? toDecimalComma(text) : text);
    const stored = (text: string) => (host.decimalComma ? fromDecimalComma(text) : text);
    const has = (name: string) => plotOption(host.text, name) !== undefined;
    const write = (name: string, value: string | undefined) => host.write(withPlotOption(host.text, name, value));
    // Asked for as written in the line; empty takes the option away.
    const asked = (label: UiKey, question: UiKey, name: string): ChartMenuItem => ({
      kind: 'action',
      label: t(c, label),
      checked: has(name),
      run: () =>
        void host.ask(t(c, question), shown(plotOption(host.text, name) ?? '')).then((answer) => {
          if (answer === undefined) return;
          write(name, answer.trim() === '' ? undefined : stored(answer.trim()));
        }),
    });
    // Words of an axis: in quotes in the line, not in the question.
    const words = (label: UiKey, question: UiKey, name: string): ChartMenuItem => ({
      kind: 'action',
      label: t(c, label),
      checked: has(name),
      run: () =>
        void host.ask(t(c, question), (plotOption(host.text, name) ?? '').replace(/^"|"$/g, '')).then((answer) => {
          if (answer === undefined) return;
          write(name, answer.trim() === '' ? undefined : `"${answer.trim().replace(/"/g, '')}"`);
        }),
    });
    const logarithmic = (label: UiKey, name: string): ChartMenuItem => ({ kind: 'action', label: t(c, label), checked: /log/.test(plotOption(host.text, name) ?? ''), run: () => write(name, /log/.test(plotOption(host.text, name) ?? '') ? undefined : '"log"') });
    return [
      asked('chart.xRange', 'chart.xRangeAsk', 'xlim'),
      ...(has('xlim') || has('ylim') ? [{ kind: 'action' as const, label: t(c, 'chart.fullRange'), run: () => host.write(withPlotOption(withPlotOption(host.text, 'xlim', undefined), 'ylim', undefined)) }] : []),
      words('chart.title', 'chart.titleAsk', 'title'),
      words('chart.xLabel', 'chart.xLabelAsk', 'xlabel'),
      words('chart.yLabel', 'chart.yLabelAsk', 'ylabel'),
      logarithmic('chart.xLog', 'xscale'),
      logarithmic('chart.yLog', 'yscale'),
      { kind: 'separator' },
      asked('chart.hline', 'chart.hlineAsk', 'hline'),
      asked('chart.vline', 'chart.vlineAsk', 'vline'),
      asked('chart.cursors', 'chart.cursorsAsk', 'cursors'),
    ];
  };

  /** The y axis of a chart: from .. to as asked for (ylim), or following the values again. */
  const yRangeItems = (): ChartMenuItem[] => {
    const c = host.catalog;
    const current = plotYRange(host.text);
    const shown = (text: string) => (host.decimalComma ? toDecimalComma(text) : text);
    const roots = plotShowsRoots(host.text);
    return [
      { kind: 'separator' },
      // The roots of the curves on the x axis, marked and labelled.
      { kind: 'action', label: t(c, 'chart.roots'), checked: roots, run: () => host.write(withPlotRoots(host.text, !roots)) },
      // The peaks and dips of the curves (where y′ = 0, the vertex of a parabola) with their coordinates.
      { kind: 'action', label: t(c, 'chart.extremes'), checked: plotFlag(host.text, 'extremes'), run: () => host.write(withPlotFlag(host.text, 'extremes', !plotFlag(host.text, 'extremes'))) },
      // Where the curves turn from bending one way to the other: y″ changes its sign.
      { kind: 'action', label: t(c, 'chart.inflections'), checked: plotFlag(host.text, 'inflections'), run: () => host.write(withPlotFlag(host.text, 'inflections', !plotFlag(host.text, 'inflections'))) },
      // The axis of symmetry of a symmetric curve (a parabola: x = −b/(2·a)), drawn where the curve has one.
      { kind: 'action', label: t(c, 'chart.symmetry'), checked: plotFlag(host.text, 'symmetry'), run: () => host.write(withPlotFlag(host.text, 'symmetry', !plotFlag(host.text, 'symmetry'))) },
      // The range of x moved so the axis of symmetry is in its middle (as wide as written; the line keeps its range).
      { kind: 'action', label: t(c, 'chart.center'), checked: plotFlag(host.text, 'center'), run: () => host.write(withPlotFlag(host.text, 'center', !plotFlag(host.text, 'center'))) },
      {
        kind: 'action',
        label: t(c, 'chart.yRange'),
        checked: current !== undefined,
        run: () =>
          void host.ask(t(c, 'chart.yRangeAsk'), current ? shown(current) : '').then((answer) => {
            if (answer === undefined) return;
            // "-20 .. 20", "-20 20" or "-20; 20": two numbers, a unit after either kept as written.
            const typed = answer.trim();
            const range = typed === '' ? undefined : typed.includes('..') ? typed : typed.replace(/\s*;\s*|\s+(?=[-−+]?\d)/, ' .. ');
            const stored = range && host.decimalComma ? fromDecimalComma(range) : range;
            host.write(withPlotYRange(host.text, stored?.replace(/\s*\.\.\s*/, ' .. ')));
          }),
      },
      ...(current !== undefined ? [{ kind: 'action' as const, label: t(c, 'chart.yRangeAuto'), run: () => host.write(withPlotYRange(host.text, undefined)) }] : []),
      ...chartAxisItems(),
      { kind: 'separator' },
      ...chartToolItems(),
      ...chartLookItems(),
    ];
  };

  /** A surface: shown as a map or in 3D, its view as dragged or back to the usual one. */
  const surfaceItems = (): ChartMenuItem[] => {
    const c = host.catalog;
    const set = (name: string, value: string | undefined) => host.write(withPlotOption(host.text, name, value));
    const threeD = plotOption(host.text, 'kind')?.replace(/"/g, '') === 'surface';
    const view = plotOption(host.text, 'view');
    const cut = plotOption(host.text, 'cut');
    return [
      { kind: 'separator' },
      { kind: 'action', label: t(c, 'chart.asMap'), checked: !threeD, run: () => host.write(withPlotOption(withPlotOption(host.text, 'kind', undefined), 'view', undefined)) },
      { kind: 'action', label: t(c, 'chart.as3d'), checked: threeD, run: () => set('kind', '"surface"') },
      ...(threeD ? [{ kind: 'action' as const, label: t(c, 'chart.viewFromAbove'), run: () => set('view', `"az=0 el=90"`) }] : []),
      ...(threeD && view ? [{ kind: 'action' as const, label: t(c, 'chart.viewUsual'), run: () => set('view', undefined) }] : []),
      { kind: 'separator' },
      {
        kind: 'action',
        label: t(c, 'chart.cut'),
        checked: cut !== undefined,
        run: () =>
          void host.ask(t(c, 'chart.cutAsk'), cut ? (host.decimalComma ? toDecimalComma(cut) : cut).replace('==', '=') : '').then((answer) => {
            if (answer === undefined) return;
            // "y = 1 m" as written by hand: the equation of the line of the cut, == in the sheet.
            const typed = answer.trim().replace(/\s*={1,2}\s*/, ' == ');
            set('cut', typed ? (host.decimalComma ? fromDecimalComma(typed) : typed) : undefined);
          }),
      },
      ...(cut !== undefined ? [{ kind: 'action' as const, label: t(c, 'chart.cutRemove'), run: () => set('cut', undefined) }] : []),
      ...chartLookItems(),
    ];
  };

  /** The look of the chart: colours, lines, grid, text; for this chart or as the style of charts of the calculation. */
  const chartLookItems = (): ChartMenuItem[] => {
    const block = host.block;
    if (block?.kind !== 'chart' || !host.onLook) return [];
    const write = (style: string | undefined) => host.write(withPlotOption(host.text, 'style', style));
    return [{ kind: 'separator' }, { kind: 'action', label: t(host.catalog, 'look.menu'), run: () => host.onLook!(block, write) }];
  };

  /** The area under the curve (hatched, its integral in it), the tangent to drag along it, the labels back in place. */
  const chartToolItems = (): ChartMenuItem[] => {
    const c = host.catalog;
    const block = host.block;
    const chart = block?.kind === 'chart' ? block : undefined;
    const set = (name: string, value: string | undefined) => host.write(withPlotOption(host.text, name, value));
    const area = plotOption(host.text, 'area');
    const tangent = plotOption(host.text, 'tangent');
    // Between the roots of the curve where the chart shows them, else empty to be written.
    const roots = chart?.spec.series[0]?.roots;
    const suggested = area ?? (roots && roots.length >= 2 ? `${writtenNumber(roots[0]!)} .. ${writtenNumber(roots[roots.length - 1]!)}` : '');
    const shown = (text: string) => (host.decimalComma ? toDecimalComma(text) : text);
    const integrals = host.integrals;
    const askBounds = () =>
      void host.ask(t(c, 'chart.areaAsk'), shown(area && area.includes('..') ? area : suggested)).then((answer) => {
        if (answer === undefined) return;
        const typed = answer.trim();
        const range = typed === '' ? undefined : typed.includes('..') ? typed : typed.replace(/\s*;\s*|\s+(?=[-−+]?[\d\p{L}])/u, ' .. ');
        set('area', range && host.decimalComma ? fromDecimalComma(range) : range);
      });
    return [
      {
        kind: 'submenu',
        label: t(c, 'chart.area'),
        items: [
          ...integrals.map((i): ChartMenuItem => ({ kind: 'action', label: t(c, 'chart.areaOf', { integral: i.text.length > 60 ? `${i.text.slice(0, 57)}…` : i.text }), checked: area === i.name, run: () => set('area', i.name) })),
          ...(integrals.length > 0 ? [{ kind: 'separator' as const }] : []),
          { kind: 'action', label: t(c, 'chart.areaBounds'), checked: area !== undefined && area.includes('..'), run: askBounds },
          ...(area !== undefined ? [{ kind: 'action' as const, label: t(c, 'chart.areaOff'), run: () => set('area', undefined) }] : []),
        ],
      },
      {
        kind: 'action',
        label: t(c, 'chart.tangent'),
        checked: tangent !== undefined,
        // Switched on at three quarters of the x axis; dragged along the curve from there.
        run: () => {
          if (tangent !== undefined || !chart) return set('tangent', undefined);
          // On the visible part of the curve, near three quarters of the x axis.
          const { layout } = chart;
          const x = nearestOnCurve(chart, xPosition(layout, layout.x.min + (layout.x.max - layout.x.min) * 0.75), (layout.plot.top + layout.plot.bottom) / 2);
          set('tangent', chartX(chart, x ?? layout.x.min + (layout.x.max - layout.x.min) * 0.75));
        },
      },
      {
        // A point of the sheet marked in the chart: the vertex [x_v; y_v], or rows of points.
        kind: 'action',
        label: t(c, 'chart.points'),
        checked: plotOption(host.text, 'points') !== undefined,
        run: () =>
          void host.ask(t(c, 'chart.pointsAsk'), shown(plotOption(host.text, 'points') ?? '[x_v, y_v]')).then((answer) => {
            if (answer === undefined) return;
            const typed = answer.trim();
            set('points', typed === '' ? undefined : host.decimalComma ? fromDecimalComma(typed) : typed);
          }),
      },
      {
        // A note anywhere in the chart: it appears in the corner of the plot and is dragged where it belongs.
        kind: 'action',
        label: t(c, 'chart.note'),
        run: () =>
          void host.ask(t(c, 'chart.noteAsk'), '').then((answer) => {
            if (!answer?.trim()) return;
            set('style', `"${chartLookText(withNewNote(chart?.ownLook ?? {}, answer))}"`);
          }),
      },
      ...(plotOption(host.text, 'labels') !== undefined ? [{ kind: 'action' as const, label: t(c, 'chart.labelsReset'), run: () => set('labels', undefined) }] : []),
    ];
  };

  return host.block?.spec.surface ? surfaceItems() : yRangeItems();
}
