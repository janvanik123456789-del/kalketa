/**
 * The parts of a chart a click opens to be edited, and how a change of one goes into its look.
 * The look is kept in the line of the chart (plot(…, style: "…")), so the printout has it too.
 */

import { SERIES_COLORS, type ChartLook, type ChartSpec } from '@kalketa/chart';

/** xTitle, yTitle, xTicks, yTicks, legend, names, axis, grid, or a curve: s0, s1, … */
export type ChartPart = string;

export function partKind(part: ChartPart): 'text' | 'lines' | 'curve' {
  if (/^s\d+$/.test(part)) return 'curve';
  return part === 'axis' || part === 'grid' ? 'lines' : 'text';
}

/** Parts that the mouse moves. */
export function partMoves(part: ChartPart): boolean {
  return part === 'xTitle' || part === 'yTitle' || part === 'legend';
}

/** The look with properties of a part set, or taken away with undefined. */
export function withPartChanges(look: ChartLook, part: ChartPart, changes: Readonly<Record<string, string | undefined>>): ChartLook {
  const parts: Record<string, string> = { ...look.parts };
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) delete parts[`${part}.${name}`];
    else parts[`${part}.${name}`] = value;
  }
  const { parts: _old, ...rest } = look;
  return Object.keys(parts).length > 0 ? { ...rest, parts } : rest;
}

/** The look with all that a part has set taken away; the grid also takes the plot's background. */
export function withoutPart(look: ChartLook, part: ChartPart): ChartLook {
  const parts = Object.fromEntries(Object.entries(look.parts ?? {}).filter(([key]) => !key.startsWith(`${part}.`) && !(part === 'grid' && key.startsWith('plot.'))));
  const { parts: _old, ...rest } = look;
  const clean: Record<string, unknown> = { ...rest };
  if (part === 'grid') {
    delete clean.grid;
    delete clean.frame;
  }
  if (part === 'legend') delete clean.legend;
  if (part === 'names') delete clean.names;
  return (Object.keys(parts).length > 0 ? { ...clean, parts } : clean) as ChartLook;
}

/** The colour a curve has now. */
export function lookOption(look: ChartLook, _spec: ChartSpec, part: ChartPart): string {
  const i = Number(part.slice(1));
  const colors = look.colors && look.colors.length > 0 ? look.colors : SERIES_COLORS;
  return look.parts?.[`${part}.color`] ?? colors[i % colors.length]!;
}
