/**
 * @kalketa/chart-editor — editing a chart on screen: its mouse handling, small windows and menu. It gets the chart as
 * drawn (a print block) and hands back changed plot lines; it knows nothing of the sheet, layers or files. The drawing
 * itself is @kalketa/chart, what a plot line computes is @kalketa/core.
 */

export * from './logic/index.js';
export { ChartLookDialog } from './ChartLookDialog.js';
export { ChartPartPanel } from './ChartPartPanel.js';
export { ChartView } from './ChartView.js';
export { drawInPlace } from './drawInPlace.js';
export { chartMenuItems, type ChartMenuHost, type ChartMenuItem } from './chartMenus.js';
export { startEdgeResize, startResize } from './resize.js';
export { useChartEditing, type ChartEditing, type ChartLine } from './useChartEditing.js';
