/**
 * Insert > Chart…: what can be drawn from the sheet (its functions of one and of two variables, its relations,
 * its series of numbers), the kind of chart chosen for it, and the plot(…) line that draws it.
 */

/** Kinds of chart the dialog offers, each a plot line of its own form. */
export const CHART_KINDS = ['curve', 'points', 'bars', 'implicit', 'map', 'surface'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

/** A function of the sheet: its name and parameters, and the range of each as first offered. */
export interface ChartFunction {
  readonly name: string;
  readonly params: readonly string[];
  readonly ranges: readonly ChartRange[];
}

/** A relation of the sheet with a name ({eq=Kruh}): drawn as the curve where it holds. */
export interface ChartRelation {
  readonly name: string;
  readonly text: string;
  /** The names it is drawn over (x and y) and their ranges as first offered. */
  readonly axes: readonly string[];
  readonly ranges: readonly ChartRange[];
}

/** A range of an axis as written: "0 m" .. "a". */
export interface ChartRange {
  readonly from: string;
  readonly to: string;
}

/** What the sheet offers to draw. */
export interface ChartSources {
  readonly functions: readonly ChartFunction[];
  readonly relations: readonly ChartRelation[];
  /** Series of numbers: columns of tables, series of the sheet (Body.y). */
  readonly series: readonly string[];
}

/** What is chosen in the dialog. */
export interface ChartChoice {
  readonly kind: ChartKind;
  /** The function (curve, map, surface) or relation (implicit) drawn, by name. */
  readonly source?: string;
  /** More functions in one chart (curve only). */
  readonly more?: readonly string[];
  /** The series of a chart of data, and the series of x under it (else the order of the items). */
  readonly data?: string;
  readonly dataX?: string;
  readonly ranges: readonly ChartRange[];
  readonly title?: string;
  /** Curve only: roots and peaks marked. */
  readonly roots?: boolean;
  readonly extremes?: boolean;
}

/** Which sources a kind of chart draws from. */
export function kindNeeds(kind: ChartKind): 'function1' | 'function2' | 'relation' | 'series' {
  return kind === 'curve' ? 'function1' : kind === 'map' || kind === 'surface' ? 'function2' : kind === 'implicit' ? 'relation' : 'series';
}

/** Whether the sheet has anything a kind of chart can draw. */
export function kindAvailable(kind: ChartKind, sources: ChartSources): boolean {
  const needs = kindNeeds(kind);
  if (needs === 'series') return sources.series.length > 0;
  if (needs === 'relation') return sources.relations.length > 0;
  return sources.functions.some((f) => f.params.length === (needs === 'function1' ? 1 : 2));
}

const quote = (text: string) => `"${text.replace(/"/g, "'")}"`;
const range = (name: string, r: ChartRange | undefined) => `${name}: ${(r?.from ?? '').trim() || '0'} .. ${(r?.to ?? '').trim() || '1'}`;

/** The plot line of a choice, as the sheet reads it; undefined when the choice is not complete. */
export function chartLine(choice: ChartChoice, sources: ChartSources): string | undefined {
  const title = choice.title?.trim() ? `, title: ${quote(choice.title.trim())}` : '';
  switch (choice.kind) {
    case 'curve': {
      const own = sources.functions.find((f) => f.name === choice.source && f.params.length === 1);
      if (!own) return undefined;
      const p = own.params[0]!;
      // More functions of one variable over the same axis: each called with the variable of the first.
      const calls = [own.name, ...(choice.more ?? []).filter((m) => m !== own.name && sources.functions.some((f) => f.name === m && f.params.length === 1))].map((name) => `${name}(${p})`);
      const marks = `${choice.roots ? ', roots: true' : ''}${choice.extremes ? ', extremes: true' : ''}`;
      return `plot(${calls.join(', ')}, ${range(p, choice.ranges[0])}${marks}${title})`;
    }
    case 'map':
    case 'surface': {
      const own = sources.functions.find((f) => f.name === choice.source && f.params.length === 2);
      if (!own) return undefined;
      const [a, b] = own.params as [string, string];
      return `plot(${own.name}(${a}, ${b}), ${range(a, choice.ranges[0])}, ${range(b, choice.ranges[1])}${choice.kind === 'surface' ? ', kind: "surface"' : ''}${title})`;
    }
    case 'implicit': {
      const own = sources.relations.find((r) => r.name === choice.source);
      if (!own || own.axes.length < 2) return undefined;
      return `plot(${own.name}, ${range(own.axes[0]!, choice.ranges[0])}, ${range(own.axes[1]!, choice.ranges[1])}${title})`;
    }
    case 'points':
    case 'bars': {
      if (!choice.data || !sources.series.includes(choice.data)) return undefined;
      const x = choice.dataX && sources.series.includes(choice.dataX) ? `, x: ${choice.dataX}` : '';
      return `plot(${choice.data}${x}, kind: ${choice.kind === 'bars' ? '"bar"' : '"points"'}${title})`;
    }
  }
}

/** The first choice of a kind: the last source of the sheet it can draw, with the ranges first offered. */
export function firstChoice(kind: ChartKind, sources: ChartSources): ChartChoice {
  const needs = kindNeeds(kind);
  if (needs === 'series') {
    // y: the last series, x: the one before it (a table of x, y reads that way).
    const n = sources.series.length;
    return { kind, ...(n > 0 ? { data: sources.series[n - 1]! } : {}), ...(n > 1 ? { dataX: sources.series[n - 2]! } : {}), ranges: [] };
  }
  if (needs === 'relation') {
    const own = sources.relations[sources.relations.length - 1];
    return { kind, ...(own ? { source: own.name } : {}), ranges: own?.ranges ?? [] };
  }
  const own = [...sources.functions].reverse().find((f) => f.params.length === (needs === 'function1' ? 1 : 2));
  return { kind, ...(own ? { source: own.name } : {}), ranges: own?.ranges ?? [] };
}

/** The kind offered first: a surface where the last function is of two variables, else a curve, else what the sheet has. */
export function firstKind(sources: ChartSources): ChartKind {
  const last = sources.functions[sources.functions.length - 1];
  if (last?.params.length === 2) return 'map';
  if (last?.params.length === 1) return 'curve';
  return CHART_KINDS.find((k) => kindAvailable(k, sources)) ?? 'curve';
}
