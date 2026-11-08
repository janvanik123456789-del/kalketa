/**
 * Kalketa as an MCP server (docs/navrhy/MCP-SERVER.md): an AI application of the user (Claude Code, Claude Desktop,
 * others) works with the sheet open in Kalketa through the Model Context Protocol, on the user's own subscription.
 * Off until the user switches it on; only on 127.0.0.1, with a token; it never changes the calculation itself.
 *
 * This process holds the HTTP server and the settings; the tools run in the editor (it has the open sheets), asked
 * over IPC and answered with text. Stateless: every request stands alone, as the protocol allows.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { readPolicy } from './ai.js';
import { appendLog } from './diagnostics.js';

/** A high port of its own (Open CalcSheet Studio has 3879); the smoke test takes another one, not to meet a running Kalketa. */
export const DEFAULT_MCP_PORT = Number(process.env['KALKETA_MCP_PORT']) || 3891;
/** Longest request accepted, and how many requests a minute. */
const MAX_BODY = 1_000_000;
const PER_MINUTE = 120;
/** How long the editor may take for a tool. */
const TOOL_TIMEOUT_MS = 30_000;

interface McpSettings {
  readonly on: boolean;
  readonly port: number;
  readonly token: string;
  readonly readOnly: boolean;
}

/** What the editor shows of the server. */
export interface McpState extends McpSettings {
  readonly paused: boolean;
  readonly status: 'off' | 'waiting' | 'connected' | 'busy-port' | 'error' | 'forbidden';
  readonly client?: string;
  readonly address: string;
  /** How an application that starts a server as a program starts Kalketa's bridge (mcpBridge.ts). */
  readonly stdio: { readonly command: string; readonly args: readonly string[] };
}

const settingsPath = () => join(app.getPath('userData'), 'mcp.json');
const newToken = () => randomBytes(32).toString('hex');

function readSettings(): McpSettings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<McpSettings>;
    return {
      on: raw.on === true,
      port: Number.isInteger(raw.port) && raw.port! >= 1024 && raw.port! <= 65535 ? raw.port! : DEFAULT_MCP_PORT,
      token: typeof raw.token === 'string' && /^[0-9a-f]{64}$/.test(raw.token) ? raw.token : newToken(),
      readOnly: raw.readOnly === true,
    };
  } catch {
    return { on: false, port: DEFAULT_MCP_PORT, token: newToken(), readOnly: false };
  }
}

function writeSettings(settings: McpSettings): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch {
    // Not kept for the next start; it still works now.
  }
}

/** The tools as the AI sees them: names and descriptions in English (the client translates). */
const TOOLS: readonly { name: string; description: string; input: z.ZodRawShape; writes?: boolean }[] = [
  { name: 'tabs_list', description: 'The calculation sheets open in Kalketa: title, whether saved, which one is active. Tools work with the active one.', input: {} },
  {
    name: 'sheet_get',
    description:
      'The active calculation sheet: its numbered lines in the calculation language, the computed results, errors and warnings, checks, auxiliary layers and the journal of AI proposals. Read it before you explain or propose anything; line numbers refer to it.',
    input: {},
  },
  { name: 'sheet_trace', description: 'Where a value of the active sheet comes from: its formula, the inputs and table rows behind it, as a tree.', input: { name: z.string().describe('A name defined in the sheet, e.g. sigma or M_Ed as written there') } },
  {
    name: 'theory_get',
    description: 'Sections of the theory the author chose for the sheet (its sources and theory libraries), those matching a question first, with ids to cite like [T3].',
    input: { query: z.string().describe('What the theory is wanted for, in the words of the task').optional() },
  },
  {
    name: 'language_guide',
    description: 'How Kalketa writes a calculation: the calculation language (definitions, units, relations, derivations, checks, charts, tables) and the rules of writing a sheet. Read it before writing any line of the calculation language.',
    input: {},
  },
  { name: 'catalog', description: 'The formula library and the worked samples Kalketa carries: ids and titles. Read one with formula_get or sample_get.', input: {} },
  { name: 'formula_get', description: 'One formula of the library: the equation, its quantities with units, example and checked values, its source.', input: { id: z.string().describe('Id from the catalog') } },
  { name: 'sample_get', description: 'One worked sample: a whole checked sheet in the calculation language, to see how such a calculation is written. Inspiration, never data of the task.', input: { id: z.string().describe('Id from the catalog') } },
  {
    name: 'propose_change',
    description:
      'Propose a change of the active sheet. Nothing changes until the person accepts it in Kalketa (a card with Accept and Reject). Each change replaces lines ("replace": "12" or "12-14", no lines = delete them) or puts lines in after a line ("after": 14, 0 = at the top); line numbers as sheet_get gives them now, the new lines in the calculation language without numbers. The changes of one call belong together and can be accepted at once. Kalketa computes the sheet with them at once and answers with the errors, failed checks and numbers in text the sheet does not compute: when there are any, call again with the corrected changes and their ids in "replaces".',
    input: {
      changes: z
        .array(
          z.object({
            replace: z.string().regex(/^\d+(-\d+)?$/).optional().describe('Lines replaced: "12" or "12-14"'),
            after: z.number().int().min(0).optional().describe('Put the lines in after this line (0: at the top)'),
            lines: z.array(z.string()).describe('The new lines, in the calculation language'),
          }),
        )
        .min(1)
        .max(20),
      note: z.string().max(4000).optional().describe('What the change does and why, for the person (in their language)'),
      replaces: z.array(z.string()).optional().describe('Ids of earlier proposals this one corrects: they are closed, and lines of an accepted one are taken out first'),
    },
    writes: true,
  },
  { name: 'proposal_status', description: 'What became of your proposals: open, accepted, rejected, replaced, or no longer fitting the sheet (it changed since).', input: { ids: z.array(z.string()).optional().describe('Ids; all your proposals in this sheet when left out') } },
  {
    name: 'propose_new_sheet',
    description: 'Propose a whole new calculation as a new sheet (only when the person asks for a new sheet). The person opens it in Kalketa with a click. The first line is a level-one heading with its title.',
    input: { title: z.string().max(200), lines: z.array(z.string()).min(1).describe('The whole sheet, line by line, in the calculation language') },
    writes: true,
  },
];

/** What the server says of itself to the client. */
const INSTRUCTIONS = `Kalketa is a program for engineering calculations written as on paper: a sheet of definitions with units, relations, derivations and checks, computed by the program and printed. You work with the sheet open in Kalketa.
- Read sheet_get first, and language_guide before you write any line of the calculation language.
- You never change the sheet yourself: propose changes with propose_change and the person accepts or rejects them in Kalketa. Read what the check of a proposal says, and correct it with replaces until it computes without errors; then tell the person to look at the card in Kalketa.
- The program computes: do not recalculate results by hand. Cite the theory by its ids ([T3]) from theory_get.`;

export function registerMcpBridge(fromEditor: (event: IpcMainInvokeEvent) => unknown): void {
  let settings = readSettings();
  writeSettings(settings);
  let paused = false;
  let server: Server | undefined;
  let status: McpState['status'] = 'off';
  // The client's name, kept for the next start: a client that stays connected while Kalketa restarts does not say it again.
  const clientFile = () => join(app.getPath('userData'), 'mcp-client.txt');
  let client: string | undefined = (() => {
    try {
      return readFileSync(clientFile(), 'utf8').trim().slice(0, 60) || undefined;
    } catch {
      return undefined;
    }
  })();
  /** The window the tools work in: the one used last. */
  let lastWindow: BrowserWindow | undefined;
  app.on('browser-window-focus', (_event, window) => (lastWindow = window));
  const recent: number[] = [];
  const waiting = new Map<string, (answer: { ok: boolean; text: string }) => void>();

  const state = (): McpState => ({ ...settings, paused, status, ...(client ? { client } : {}), address: `http://127.0.0.1:${settings.port}/mcp`, stdio: { command: process.execPath, args: app.isPackaged ? ['--mcp-stdio'] : [app.getAppPath(), '--mcp-stdio'] } });
  const tell = () => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('kalketa:mcp-state', state());
  };

  /** A tool run in the editor of the window used last. */
  const askEditor = (tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> => {
    const window = lastWindow && !lastWindow.isDestroyed() ? lastWindow : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!window) return Promise.resolve({ ok: false, text: 'Kalketa has no window open.' });
    const id = randomBytes(8).toString('hex');
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ ok: false, text: 'Kalketa did not answer in time.' });
      }, TOOL_TIMEOUT_MS);
      waiting.set(id, (answer) => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(answer);
      });
      window.webContents.send('kalketa:mcp-call', { id, tool, args });
    });
  };

  const mcpServer = () => {
    const mcp = new McpServer({ name: 'kalketa', version: app.getVersion() }, { instructions: INSTRUCTIONS });
    for (const tool of TOOLS)
      mcp.registerTool(tool.name, { description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: !tool.writes, destructiveHint: false, openWorldHint: false } }, async (args: Record<string, unknown>) => {
        if (paused) return { content: [{ type: 'text' as const, text: 'Kalketa: the connection is paused by the user. Ask them to resume it (Tools → AI from outside).' }], isError: true };
        if (tool.writes && settings.readOnly) return { content: [{ type: 'text' as const, text: 'Kalketa: the connection is read-only (set by the user): you can read and explain, not propose.' }], isError: true };
        // The client's name goes with the call: proposals are kept under it.
        const answer = await askEditor(tool.name, { ...(args ?? {}), _client: client ?? 'MCP' });
        appendLog('mcp.log', { event: 'tool', tool: tool.name, ok: answer.ok, chars: answer.text.length, client: client ?? null });
        return { content: [{ type: 'text' as const, text: answer.text }], ...(answer.ok ? {} : { isError: true }) };
      });
    return mcp;
  };

  const sameToken = (header: string | undefined) => {
    const given = /^Bearer\s+([0-9a-f]{64})$/i.exec(header ?? '')?.[1]?.toLowerCase();
    return !!given && timingSafeEqual(Buffer.from(given), Buffer.from(settings.token));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const refuse = (code: number, text: string) => {
      res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    // A web page in a browser on this computer must not reach the sheet: requests from a page carry its origin.
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return refuse(403, 'Forbidden origin');
    if ((req.url ?? '').split('?')[0] !== '/mcp') return refuse(404, 'Kalketa MCP is at /mcp');
    if (!sameToken(req.headers.authorization)) return refuse(401, 'A token is needed: Authorization: Bearer <token> (Kalketa, Tools → AI from outside)');
    if (req.method !== 'POST') return refuse(405, 'POST only (stateless server)');
    const now = Date.now();
    while (recent.length > 0 && recent[0]! < now - 60_000) recent.shift();
    if (recent.length >= PER_MINUTE) return refuse(429, 'Too many requests');
    recent.push(now);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) return refuse(413, 'Request too large');
      chunks.push(chunk as Buffer);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return refuse(400, 'Not JSON');
    }
    // The client says its name when it starts: shown in the status bar.
    const first = Array.isArray(body) ? body[0] : body;
    const info = (first as { method?: string; params?: { clientInfo?: { name?: unknown } } })?.method === 'initialize' ? (first as { params?: { clientInfo?: { name?: unknown } } }).params?.clientInfo?.name : undefined;
    if (typeof info === 'string' && info.trim() && info.trim().slice(0, 60) !== client) {
      client = info.trim().slice(0, 60);
      try {
        writeFileSync(clientFile(), client);
      } catch {
        // Kept for this run only.
      }
    }
    if (status !== 'connected') {
      status = 'connected';
      tell();
    } else if (typeof info === 'string') tell();
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true }); // no sessionIdGenerator: stateless
    const mcp = mcpServer();
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  const stop = async () => {
    const was = server;
    server = undefined;
    if (was) await new Promise<void>((resolve) => was.close(() => resolve()));
  };
  const start = async () => {
    await stop();
    if (!settings.on) {
      status = 'off';
      return tell();
    }
    if (readPolicy().disabled) {
      status = 'forbidden';
      return tell();
    }
    const s = createServer((req, res) => {
      handle(req, res).catch((error: unknown) => {
        appendLog('mcp.log', { event: 'error', error: error instanceof Error ? error.message : String(error) });
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) => {
      s.once('error', (error: NodeJS.ErrnoException) => {
        status = error.code === 'EADDRINUSE' ? 'busy-port' : 'error';
        resolve();
      });
      s.listen(settings.port, '127.0.0.1', () => {
        server = s;
        status = 'waiting';
        resolve();
      });
    });
    appendLog('mcp.log', { event: 'start', port: settings.port, status });
    tell();
  };

  ipcMain.on('kalketa:mcp-result', (_event, answer: { id?: unknown; ok?: unknown; text?: unknown }) => {
    if (typeof answer?.id !== 'string') return;
    waiting.get(answer.id)?.({ ok: answer.ok === true, text: typeof answer.text === 'string' ? answer.text : '' });
  });
  ipcMain.handle('kalketa:mcp-state', (event) => {
    fromEditor(event);
    return state();
  });
  ipcMain.handle('kalketa:mcp-set', async (event, change: { on?: unknown; readOnly?: unknown; paused?: unknown; newToken?: unknown; port?: unknown }) => {
    fromEditor(event);
    const before = settings;
    settings = {
      ...settings,
      ...(typeof change?.on === 'boolean' ? { on: change.on } : {}),
      ...(typeof change?.readOnly === 'boolean' ? { readOnly: change.readOnly } : {}),
      ...(change?.newToken === true ? { token: newToken() } : {}),
      ...(Number.isInteger(change?.port) && (change!.port as number) >= 1024 && (change!.port as number) <= 65535 ? { port: change!.port as number } : {}),
    };
    if (typeof change?.paused === 'boolean') paused = change.paused;
    writeSettings(settings);
    if (settings.on !== before.on || settings.port !== before.port || settings.token !== before.token) await start();
    else tell();
    return state();
  });
  app.on('will-quit', () => void stop());
  void app.whenReady().then(start);
}
