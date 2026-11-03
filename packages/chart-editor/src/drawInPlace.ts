/**
 * A chart drawn anew where it stands, from what its block already holds: no line written, nothing calculated. This is what
 * keeps editing quick, as a change written into the line recalculates the whole sheet.
 */

import { formatDate, formatNumber, type Catalog } from '@kalketa/i18n';
import { chartSvg, type ChartLook, type ChartSpec } from '@kalketa/chart';
import type { PrintBlock } from '@kalketa/render';

export function drawInPlace(view: Element | null | undefined, block: Extract<PrintBlock, { kind: 'chart' }>, catalog: Catalog, look: ChartLook = block.look, spec: ChartSpec = block.spec): void {
  const svg = view?.querySelector('svg.chart-svg');
  if (!svg) return;
  svg.outerHTML = chartSvg(spec, {
    width: block.layout.width,
    height: block.layout.height,
    look,
    format: (v) => formatNumber(v, catalog, { digits: 4 }).replace('-', '−'),
    ...(block.xDates ? { formatX: (days: number) => formatDate(days, catalog) } : {}),
    ...(block.caption ? { title: block.caption } : {}),
  });
}
