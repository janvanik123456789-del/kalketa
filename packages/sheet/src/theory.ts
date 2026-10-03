/**
 * Theory for the AI (docs/01-filozofie.md, ch. 9.6): the sources layers of a
 * sheet, split into sections by their headings. Each heading carries a stable
 * id, written after it as {#T3}; the program gives one to every heading
 * without it and never renumbers, so a citation [T3] keeps pointing at the
 * same section. The text before the first heading of a layer is a section
 * without an id: the model reads it but cannot cite it.
 */

import { updateLayer, type Layer } from './layers.js';

export interface TheorySection {
  /** "T3"; absent for the text before the first heading. */
  readonly id?: string;
  readonly title: string;
  readonly text: string;
  /** Id of the layer it is written in. */
  readonly layer: string;
}

const HEADING = /^(#{1,3})\s+(.*?)\s*$/;
const ID = /\s*\{#(T\d+)\}$/;

/** Every theory section of the sheet, in layer order. */
export function theorySections(layers: readonly Layer[]): TheorySection[] {
  return layers.flatMap((layer) => (layer.kind === 'sources' ? layerSections(layer) : []));
}

function layerSections(layer: Layer): TheorySection[] {
  const sections: TheorySection[] = [];
  let current: { id?: string; title: string; lines: string[] } = { title: layer.name ?? '', lines: [] };
  const close = () => {
    const text = current.lines.join('\n').trim();
    if (text || current.id) sections.push({ ...(current.id ? { id: current.id } : {}), title: current.title, text, layer: layer.id });
  };
  for (const line of (layer.text ?? '').split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      const id = ID.exec(heading[2]!)?.[1];
      current = { ...(id ? { id } : {}), title: heading[2]!.replace(ID, ''), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  close();
  return sections;
}

/**
 * Gives every heading in the sources layers an id it does not have yet: the
 * next free number, across all layers. A heading copied with an id already
 * used above gets a new one. Layers without changes stay as they are.
 */
export function withTheoryIds(layers: readonly Layer[]): Layer[] {
  const used = new Set<number>();
  for (const s of theorySections(layers)) if (s.id) used.add(Number(s.id.slice(1)));
  let next = Math.max(0, ...used) + 1;
  const seen = new Set<string>();
  let result = [...layers];
  for (const layer of layers) {
    if (layer.kind !== 'sources' || !layer.text) continue;
    let changed = false;
    const text = layer.text
      .split(/\r?\n/)
      .map((line) => {
        const heading = HEADING.exec(line);
        if (!heading || !heading[2]!.replace(ID, '').trim()) return line;
        const id = ID.exec(heading[2]!)?.[1];
        if (id && !seen.has(id)) {
          seen.add(id);
          return line;
        }
        changed = true;
        const fresh = `T${next++}`;
        seen.add(fresh);
        return `${heading[1]} ${heading[2]!.replace(ID, '')} {#${fresh}}`;
      })
      .join('\n');
    if (changed) result = updateLayer(result, layer.id, { text });
  }
  return result.some((l, i) => l !== layers[i]) ? result : [...layers];
}
