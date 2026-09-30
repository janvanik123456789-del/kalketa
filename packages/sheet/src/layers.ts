/**
 * Layers of a sheet (docs/01-filozofie.md, ch. 4). A new sheet has three:
 * the printed sheet, a database and AI notes; users add more.
 *
 *   sheet    the printed calculation (exactly one, id "main"; text in SheetDocument.source)
 *   calc     auxiliary calculation; the sheet may use its results
 *   data     tables (a table belongs to one data layer)
 *   ai       notes and suggestions of an LLM; never change the calculation
 *   sources  theory, requirements, reasons: text, cropped figures, citations, links
 */

import type { Diagnostic, ImportedValue, SheetResult, Table, UnitRegistry } from '@calccanvas/core';
import { SheetSession } from '@calccanvas/core';

export type LayerKind = 'sheet' | 'calc' | 'data' | 'ai' | 'sources';

export interface Layer {
  readonly id: string;
  readonly kind: LayerKind;
  /** User-given name; default layers without one are named by the program in its language. */
  readonly name?: string;
  readonly visible: boolean;
  /** Protected against accidental changes (e.g. data taken over from a catalogue). */
  readonly locked: boolean;
  /** Printed after the sheet as an appendix. */
  readonly appendix: boolean;
  /** calc: calculation text; ai and sources: notes (a small Markdown subset). */
  readonly text?: string;
  /** data: names of its tables. */
  readonly tables?: readonly string[];
}

export const MAIN_LAYER = 'main';
export const DEFAULT_DATA_LAYER = 'data';
export const DEFAULT_AI_LAYER = 'ai';

export function defaultLayers(): Layer[] {
  const base = { visible: true, locked: false, appendix: false } as const;
  return [
    { ...base, id: MAIN_LAYER, kind: 'sheet' },
    { ...base, id: DEFAULT_DATA_LAYER, kind: 'data', tables: [] },
    { ...base, id: DEFAULT_AI_LAYER, kind: 'ai', text: '' },
  ];
}

/** A new layer with a unique id, added after the others. */
export function addLayer(layers: readonly Layer[], kind: Exclude<LayerKind, 'sheet'>, name: string): { layers: Layer[]; id: string } {
  let n = layers.length + 1;
  while (layers.some((l) => l.id === `layer${n}`)) n++;
  const id = `layer${n}`;
  const layer: Layer = {
    id,
    kind,
    name,
    visible: true,
    locked: false,
    appendix: false,
    ...(kind === 'data' ? { tables: [] } : { text: '' }),
  };
  return { layers: [...layers, layer], id };
}

export function updateLayer(layers: readonly Layer[], id: string, change: Partial<Omit<Layer, 'id' | 'kind'>>): Layer[] {
  return layers.map((l) => (l.id === id ? { ...l, ...change } : l));
}

/** Removes a layer; the printed sheet stays. Tables of a removed data layer move to the first data layer. */
export function removeLayer(layers: readonly Layer[], id: string): Layer[] {
  const removed = layers.find((l) => l.id === id);
  if (!removed || removed.kind === 'sheet') return [...layers];
  const rest = layers.filter((l) => l.id !== id);
  if (removed.kind !== 'data' || !removed.tables?.length) return rest;
  const target = rest.find((l) => l.kind === 'data');
  return target ? updateLayer(rest, target.id, { tables: [...(target.tables ?? []), ...removed.tables] }) : rest;
}

/** Moves a layer up (-1) or down (+1); the printed sheet always stays first. */
export function moveLayer(layers: readonly Layer[], id: string, direction: -1 | 1): Layer[] {
  const list = [...layers];
  const i = list.findIndex((l) => l.id === id);
  const j = i + direction;
  if (i <= 0 || j <= 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j]!, list[i]!];
  return list;
}

/**
 * Tables of each data layer. Tables not listed by any layer (older files,
 * tables added elsewhere) belong to the first data layer.
 */
export function tablesByLayer(layers: readonly Layer[], tableNames: Iterable<string>): Map<string, string[]> {
  const byLayer = new Map<string, string[]>();
  const assigned = new Set<string>();
  const names = new Set(tableNames);
  for (const layer of layers) {
    if (layer.kind !== 'data') continue;
    const own = (layer.tables ?? []).filter((t) => names.has(t) && !assigned.has(t));
    own.forEach((t) => assigned.add(t));
    byLayer.set(layer.id, own);
  }
  const firstData = layers.find((l) => l.kind === 'data');
  if (firstData) byLayer.get(firstData.id)!.push(...[...names].filter((t) => !assigned.has(t)));
  return byLayer;
}

// ---------------------------------------------------------------------------
// Evaluation across layers
// ---------------------------------------------------------------------------

export interface LayerEvaluation {
  /** The printed sheet, with the results of auxiliary calculations available by name. */
  readonly main: SheetResult;
  /** Each auxiliary calculation layer, by layer id. */
  readonly aux: ReadonlyMap<string, SheetResult>;
  /** Auxiliary layers the sheet depends on, directly or through other auxiliary layers. */
  readonly used: ReadonlySet<string>;
}

/** Keeps one session per layer, so each is recalculated incrementally. */
export class LayerSessions {
  private sessions = new Map<string, SheetSession>();

  constructor(private readonly registry: UnitRegistry) {}

  evaluate(source: string, layers: readonly Layer[], tables: readonly Table[]): LayerEvaluation {
    const next = new Map<string, SheetSession>();
    const session = (id: string) => {
      const s = this.sessions.get(id) ?? new SheetSession({ registry: this.registry });
      next.set(id, s);
      return s;
    };

    // Auxiliary layers in layer order; each sees the ones before it.
    const imports = new Map<string, ImportedValue>();
    const aux = new Map<string, SheetResult>();
    for (const layer of layers) {
      if (layer.kind !== 'calc') continue;
      const result = session(layer.id).update(layer.text ?? '', { tables, imports: new Map(imports) });
      aux.set(layer.id, result);
      for (const [name, value] of result.values) {
        if (!imports.has(name)) imports.set(name, { value, layer: layer.id, layerName: layer.name ?? layer.id });
      }
    }
    const main = session(MAIN_LAYER).update(source, { tables, imports });
    this.sessions = next;
    return { main, aux, used: usedLayers(main, aux) };
  }
}

function usedLayers(main: SheetResult, aux: ReadonlyMap<string, SheetResult>): Set<string> {
  const used = new Set<string>();
  const visit = (result: SheetResult) => {
    for (const r of result.statements) {
      for (const dep of r.dependencies) {
        const layer = result.imports.get(dep)?.layer;
        if (layer && !used.has(layer)) {
          used.add(layer);
          const inner = aux.get(layer);
          if (inner) visit(inner);
        }
      }
    }
  };
  visit(main);
  return used;
}

/** Diagnostics of all calculation layers together, e.g. for a status bar. */
export function allDiagnostics(evaluation: LayerEvaluation): Diagnostic[] {
  return [...evaluation.main.diagnostics, ...[...evaluation.aux.values()].flatMap((r) => r.diagnostics)];
}

export type AppendixLayer =
  | { readonly kind: 'calc'; readonly layer: string; readonly name: string; readonly result: SheetResult }
  | { readonly kind: 'notes'; readonly layer: string; readonly name: string; readonly text: string };

/**
 * Layers printed after the sheet, in layer order: those marked as appendix,
 * and every auxiliary calculation the sheet uses (the checker must see it).
 * `nameOf` names layers that have no name of their own (default layers).
 */
export function appendixLayers(layers: readonly Layer[], evaluation: LayerEvaluation, nameOf: (layer: Layer) => string): AppendixLayer[] {
  return layers.flatMap((layer): AppendixLayer[] => {
    const name = layer.name ?? nameOf(layer);
    if (layer.kind === 'calc' && (layer.appendix || evaluation.used.has(layer.id))) {
      const result = evaluation.aux.get(layer.id);
      return result ? [{ kind: 'calc', layer: layer.id, name, result }] : [];
    }
    if ((layer.kind === 'sources' || layer.kind === 'ai') && layer.appendix) {
      return [{ kind: 'notes', layer: layer.id, name, text: layer.text ?? '' }];
    }
    return [];
  });
}
