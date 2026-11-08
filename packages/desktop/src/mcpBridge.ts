/**
 * Kalketa.exe --mcp-stdio: the MCP server of a running Kalketa for applications that start a server as a program and
 * talk to it over its standard input and output (Claude Desktop and others; docs/navrhy/MCP-SERVER.md). No window,
 * no second Kalketa: each message read from the input goes to the server of the running Kalketa on 127.0.0.1, its
 * answer comes back on the output, one JSON-RPC message a line. The address and token are read from Kalketa's own
 * settings (mcp.json), so they need not stand in the settings of the other application.
 */
import { app } from 'electron';
import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// The same profile as Kalketa's (a profile of its own when it is given).
if (process.env['KALKETA_USER_DATA']) app.setPath('userData', process.env['KALKETA_USER_DATA']);

const NOT_RUNNING = 'Kalketa is not running, or its MCP server is off. Start Kalketa and switch it on in Tools → AI from outside (MCP); then ask again.';

function settings(): { on: boolean; port: number; token: string } | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(app.getPath('userData'), 'mcp.json'), 'utf8')) as { on?: unknown; port?: unknown; token?: unknown };
    return typeof raw.port === 'number' && typeof raw.token === 'string' ? { on: raw.on === true, port: raw.port, token: raw.token } : undefined;
  } catch {
    return undefined;
  }
}

const write = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);

/** One message on to Kalketa; its answer (if any) back. */
async function forward(line: string): Promise<void> {
  let message: { id?: unknown; method?: unknown };
  try {
    message = JSON.parse(line) as { id?: unknown };
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const failed = (text: string) => {
    if (message.id !== undefined) write({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: text } });
  };
  // Read for every message: a new token or port in Kalketa holds at once.
  const own = settings();
  if (!own?.on) return failed(NOT_RUNNING);
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${own.port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${own.token}` },
      body: line,
    });
  } catch {
    return failed(NOT_RUNNING);
  }
  if (response.status === 202) return;
  const text = await response.text();
  if (!response.ok) return failed(`Kalketa answered ${response.status}: ${text.slice(0, 300)}`);
  // JSON as Kalketa answers; an event stream read for its data lines, should a server send one.
  const bodies = (response.headers.get('content-type') ?? '').includes('text/event-stream')
    ? text
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
    : [text];
  for (const body of bodies) {
    if (!body) continue;
    try {
      const parsed = JSON.parse(body) as unknown;
      for (const one of Array.isArray(parsed) ? parsed : [parsed]) write(one);
    } catch {
      failed('Kalketa sent an answer that could not be read.');
    }
  }
}

let open = 0;
let ended = false;
const done = () => {
  if (ended && open === 0) app.quit();
};
// Messages are answered in the order they came: a client may send a request before the answer to the previous one.
let queue = Promise.resolve();
// The input read from its descriptor: in Electron's main process on Windows, process.stdin receives nothing.
createInterface({ input: createReadStream('', { fd: 0 }) })
  .on('line', (line) => {
    if (!line.trim()) return;
    open++;
    queue = queue.then(() => forward(line)).finally(() => {
      open--;
      done();
    });
  })
  .on('close', () => {
    ended = true;
    done();
  });
