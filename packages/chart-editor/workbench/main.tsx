/**
 * A page with sample charts and nothing else, to work on chart editing without the rest of the program.
 * Each chart goes the way it does in a sheet: its lines are calculated, drawn, and every edit changes its plot line,
 * shown under it. npm run chart opens it; npm run smoke:chart tries it with the real mouse.
 */

import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultRegistry, evaluateSheet } from '@kalketa/core';
import { catalogFor, formatNumber } from '@kalketa/i18n';
import { BLOCK_CSS, buildPrintDocument, type PrintBlock } from '@kalketa/render';
import { chartMenuItems, ChartLookDialog, ChartView, useChartEditing } from '@kalketa/chart-editor';
import { chartLookText, parseChartLook } from '@kalketa/chart';
import { ask, AskHost } from '../../editor/src/components/Ask.js';
import { Dialog } from '../../editor/src/components/Dialogs.js';
import { ContextMenu } from '../../editor/src/components/MenuBar.js';
import { withPlotOption } from '../src/logic/plotLine.js';
import '../../editor/src/styles.css';
import '../src/chart-editor.css';

const style = document.createElement('style');
style.textContent = BLOCK_CSS;
document.head.prepend(style);

const catalog = catalogFor(new URLSearchParams(location.search).get('lang') ?? 'cs');
const FONTS = ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Georgia', 'Times New Roman', 'Verdana'];
const NO_COMMANDS = new Map<string, never>();

const SAMPLES = [
  ['M(x) := 12 kN/m·x·(5 m - x)/2 + 1 kN·m', 'plot(M(x), x: 0 m .. 5 m, hline: 30 kN·m, cursors: 1 m .. 3 m) | kN·m'],
  ['plot(sin(x), cos(x), x: 0 .. 2·π)'],
  ['y(x) := -2·x^2 + 2·x + 10', 'plot(y(x), x: -4 .. 5, roots: true, symmetry: true, area: -1.79 .. 2.79)'],
].map((lines) => lines.join('\n'));

type ChartBlock = Extract<PrintBlock, { kind: 'chart' }>;

function Sample({ index, source }: { index: number; source: string }) {
  const [text, setText] = useState(source);
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>();
  const [lookOpen, setLookOpen] = useState<{ chart: ChartBlock; write(style: string | undefined): void } | undefined>();
  const block = useMemo(() => {
    const result = evaluateSheet(text, { registry: defaultRegistry });
    return buildPrintDocument(result, { catalog, registry: defaultRegistry, digits: 4, title: '' }).blocks.find((b): b is ChartBlock => b.kind === 'chart');
  }, [text]);
  const lines = text.split('\n');
  const replace = (start: number, _end: number, next: string) => setText(lines.map((l, i) => (i === start - 1 ? next : l)).join('\n'));
  const charts = useChartEditing({ catalog, printCatalog: catalog, fonts: FONTS, onReplace: replace });
  if (!block) return <p>{text}</p>;
  const line = { start: block.line, end: block.line, text: lines[block.line - 1] ?? '' };
  charts.register(line, block);
  return (
    <section data-sample={index} className="row selected workbench-sample">
      <div
        className="content page-body"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <ChartView
          {...charts.viewProps(line, block)}
          block={block}
          catalog={catalog}
          uiCatalog={catalog}
          onResize={(width) => replace(block.line, block.line, withPlotOption(line.text, 'place', `"width=${width}%"`))}
        />
      </div>
      <code data-plot-line="">{text}</code>
      {charts.panel}
      {menu && (
        <ContextMenu
          at={menu}
          commands={NO_COMMANDS}
          onClose={() => setMenu(undefined)}
          items={chartMenuItems({
            catalog,
            decimalComma: formatNumber(1.5, catalog).includes(','),
            text: line.text,
            write: (next) => replace(block.line, block.line, next),
            block,
            integrals: [],
            ask,
            onLook: (chart, write) => setLookOpen({ chart, write }),
          })}
        />
      )}
      {lookOpen && (
        <ChartLookDialog
          catalog={catalog}
          Dialog={Dialog}
          spec={lookOpen.chart.spec}
          size={{ width: lookOpen.chart.layout.width, height: lookOpen.chart.layout.height }}
          format={(v) => formatNumber(v, catalog, { digits: 4 })}
          base={parseChartLook('')}
          own={lookOpen.chart.ownLook ?? {}}
          onApply={(look) => {
            const own = chartLookText(look);
            lookOpen.write(own ? `"${own}"` : undefined);
            setLookOpen(undefined);
          }}
          onSaveStyle={() => setLookOpen(undefined)}
          onClose={() => setLookOpen(undefined)}
        />
      )}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="workbench">
      {SAMPLES.map((source, i) => (
        <Sample key={i} index={i} source={source} />
      ))}
      <AskHost catalog={catalog} title="Kalketa" />
    </main>
  </StrictMode>,
);
