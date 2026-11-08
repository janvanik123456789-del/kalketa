/**
 * The tools of Kalketa's MCP server (docs/navrhy/MCP-SERVER.md), run in the editor over the sheet in front: the main
 * process holds the server and asks here. Reading only in this stage; each answer is text for the AI.
 */
import type { TraceNode } from '@kalketa/core';

/** What the tools read, given by the editor as it is now. */
export interface McpEnvironment {
  readonly tabs: readonly { readonly title: string; readonly saved: boolean; readonly active: boolean }[];
  /** The active sheet as the chat gives it to the model: numbered lines, findings, layers, journal. */
  sheet(): string;
  trace(name: string): TraceNode | undefined;
  /** Theory sections matching a question, with their ids. */
  theory(query: string): string;
  /** The calculation language and the rules of writing a sheet. */
  guide(): string;
  catalog(): string;
  formula(id: string): string | undefined;
  sample(id: string): string | undefined;
  /** Records proposed changes (as change blocks) in the journal, under the client; answers with the check of the sheet. */
  propose(blocks: string, note: string, replaces: readonly string[], client: string): McpAnswer;
  /** What became of the client's proposals. */
  status(ids: readonly string[], client: string): McpAnswer;
  /** Records a new sheet the person may open. */
  proposeSheet(title: string, lines: readonly string[], client: string): McpAnswer;
}

/** One change as the AI sends it. */
export interface McpChange {
  readonly replace?: string;
  readonly after?: number;
  readonly lines: readonly string[];
}

/** Changes as the change blocks the chat writes (```change 12-14), so one path records both; undefined when one is wrong. */
export function changeBlocks(changes: readonly McpChange[]): string | undefined {
  const fence = '`'.repeat(3);
  const blocks: string[] = [];
  for (const c of changes) {
    const lines = (c.lines ?? []).map((l) => String(l).replace(/\r?\n/g, ' '));
    if (c.after !== undefined && c.replace === undefined && Number.isInteger(c.after) && c.after >= 0) blocks.push(`${fence}change after ${c.after}\n${lines.join('\n')}${lines.length ? '\n' : ''}${fence}`);
    else if (c.replace !== undefined && c.after === undefined && /^\d+(-\d+)?$/.test(c.replace)) blocks.push(`${fence}change ${c.replace}\n${lines.join('\n')}${lines.length ? '\n' : ''}${fence}`);
    else return undefined;
  }
  return blocks.join('\n\n');
}

export interface McpAnswer {
  readonly ok: boolean;
  readonly text: string;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** A trace as a tree of lines: name = value ← formula (line), its inputs below. */
export function traceText(node: TraceNode): string {
  const lines: string[] = [];
  const value = (n: TraceNode) =>
    n.display ? ` = ${Number(n.display.value.toPrecision(6))}${n.display.unit ? ` ${n.display.unit}` : ''}` : n.value?.type === 'row' ? ` = ${n.value.label}` : '';
  const visit = (n: TraceNode, prefix: string, childPrefix: string) => {
    const computed = n.inputs.length > 0 || n.tables.length > 0;
    lines.push(`${prefix}${n.name}${value(n)}${n.expression && computed ? `   ← ${n.expression}` : ''}${n.line !== undefined ? `   (line ${n.line})` : ''}${n.layer ? `   [layer ${n.layer.name}]` : ''}${n.comment ? `   ' ${n.comment}` : ''}`);
    const items: (string | TraceNode)[] = [
      ...n.tables.map((t) => `table ${t.table}, row ${t.rowLabels.join(' – ')}${t.column ? `, column ${t.column}` : ''}${t.source ? ` — source: ${t.source.title}` : ''}`),
      ...n.inputs,
    ];
    items.forEach((item, i) => {
      const last = i === items.length - 1;
      if (typeof item === 'string') lines.push(`${childPrefix}${last ? '└── ' : '├── '}${item}`);
      else visit(item, childPrefix + (last ? '└── ' : '├── '), childPrefix + (last ? '    ' : '│   '));
    });
  };
  visit(node, '', '');
  return lines.join('\n');
}

/** One call of a tool. */
export function runMcpTool(tool: string, args: Readonly<Record<string, unknown>>, env: McpEnvironment): McpAnswer {
  switch (tool) {
    case 'tabs_list':
      return env.tabs.length === 0
        ? { ok: true, text: 'No sheet is open.' }
        : { ok: true, text: env.tabs.map((t, i) => `${i + 1}. ${t.title}${t.active ? ' (active)' : ''}${t.saved ? '' : ' – unsaved changes'}`).join('\n') };
    case 'sheet_get':
      return { ok: true, text: env.sheet() };
    case 'sheet_trace': {
      const name = text(args['name']);
      const node = name ? env.trace(name) : undefined;
      return node ? { ok: true, text: traceText(node) } : { ok: false, text: `The sheet defines no "${name}". Names are as written in the sheet (sheet_get).` };
    }
    case 'theory_get':
      return { ok: true, text: env.theory(text(args['query'])) };
    case 'language_guide':
      return { ok: true, text: env.guide() };
    case 'catalog':
      return { ok: true, text: env.catalog() };
    case 'formula_get': {
      const found = env.formula(text(args['id']));
      return found ? { ok: true, text: found } : { ok: false, text: `No formula "${text(args['id'])}" in the library; the ids are in catalog.` };
    }
    case 'propose_change': {
      const changes = Array.isArray(args['changes']) ? (args['changes'] as McpChange[]) : [];
      const blocks = changes.length > 0 ? changeBlocks(changes) : undefined;
      if (!blocks) return { ok: false, text: 'Each change has either "replace" ("12" or "12-14") or "after" (a line number), and its "lines".' };
      const replaces = Array.isArray(args['replaces']) ? (args['replaces'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      return env.propose(blocks, text(args['note']), replaces, text(args['_client']) || 'MCP');
    }
    case 'proposal_status': {
      const ids = Array.isArray(args['ids']) ? (args['ids'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
      return env.status(ids, text(args['_client']) || 'MCP');
    }
    case 'propose_new_sheet': {
      const lines = Array.isArray(args['lines']) ? (args['lines'] as unknown[]).map(String) : [];
      if (!text(args['title']) || lines.length === 0) return { ok: false, text: 'A new sheet needs a title and its lines.' };
      return env.proposeSheet(text(args['title']), lines, text(args['_client']) || 'MCP');
    }
    case 'sample_get': {
      const found = env.sample(text(args['id']));
      return found ? { ok: true, text: found } : { ok: false, text: `No sample "${text(args['id'])}"; the ids are in catalog.` };
    }
    default:
      return { ok: false, text: `Kalketa has no tool "${tool}".` };
  }
}
