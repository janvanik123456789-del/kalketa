/**
 * Tools → AI from outside (MCP): Kalketa's MCP server switched on and off, its address and token, and the lines
 * that connect an AI application to it (docs/navrhy/MCP-SERVER.md). The settings take effect at once.
 */
import { useState } from 'react';
import { notesHtml } from '@kalketa/render';
import HELP_CS from '../help/mcp.cs.md?raw';
import HELP_EN from '../help/mcp.en.md?raw';
import { t, type Catalog, type UiKey } from '@kalketa/i18n';
import type { DesktopBridge, McpState } from '../document.js';
import { Dialog } from './Dialogs.js';

/** The state of the server in words: "connected (claude-code)". */
export function mcpStatusText(state: McpState, catalog: Catalog): string {
  if (state.on && state.paused && state.status !== 'off') return t(catalog, 'mcp.status.paused');
  if (state.status === 'connected' && state.client) return t(catalog, 'mcp.status.connectedTo', { client: state.client });
  return t(catalog, `mcp.status.${state.status}` as UiKey, { port: String(state.port) });
}

/** Help → AI from outside (MCP): how to connect an application, and why it is done so. */
export function McpHelpDialog({ catalog, onClose }: { catalog: Catalog; onClose(): void }) {
  return (
    <Dialog title={t(catalog, 'mcp.helpTitle')} catalog={catalog} wide onClose={onClose}>
      <div className="mcp-help notes" dangerouslySetInnerHTML={{ __html: notesHtml(catalog.locale.startsWith('cs') ? HELP_CS : HELP_EN, { catalog }) }} />
    </Dialog>
  );
}

export function McpDialog({ catalog, desktop, state, onState, onClose, onHelp }: { catalog: Catalog; desktop: DesktopBridge; state: McpState; onState(state: McpState): void; onClose(): void; onHelp(): void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<string>();
  const set = (change: Parameters<NonNullable<DesktopBridge['mcpSet']>>[0]) => void desktop.mcpSet?.(change).then(onState);
  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => setCopied(what));
  };
  const hidden = '•'.repeat(16);
  const claudeCode = `claude mcp add --transport http --scope user kalketa ${state.address} --header "Authorization: Bearer ${state.token}"`;
  const json = JSON.stringify({ mcpServers: { kalketa: { type: 'http', url: state.address, headers: { Authorization: `Bearer ${state.token}` } } } }, null, 2);
  // Claude Desktop and others start a program: Kalketa itself with --mcp-stdio, which reads the token from Kalketa's settings.
  const stdio = state.stdio ? JSON.stringify({ mcpServers: { kalketa: { command: state.stdio.command, args: state.stdio.args } } }, null, 2) : undefined;
  const shownLine = (line: string) => (shown ? line : line.replace(state.token, hidden));
  const copyButton = (what: string, value: string) => (
    <button type="button" className="mcp-copy" data-mcp-copy={what} onClick={() => copy(what, value)}>
      {copied === what ? t(catalog, 'mcp.copied') : t(catalog, 'mcp.copy')}
    </button>
  );
  return (
    <Dialog title={t(catalog, 'mcp.title')} catalog={catalog} wide onClose={onClose}>
      <div className="mcp-dialog">
        <p className="hint">
          {t(catalog, 'mcp.intro')}{' '}
          <button type="button" className="mcp-help-open link" onClick={onHelp}>
            {t(catalog, 'mcp.helpLink')}
          </button>
        </p>
        <label className="mcp-switch">
          <input type="checkbox" className="mcp-on" checked={state.on} disabled={state.status === 'forbidden'} onChange={(e) => set({ on: e.target.checked })} /> {t(catalog, 'mcp.on')}
        </label>
        <span className={`mcp-status ${state.status}`}>{mcpStatusText(state, catalog)}</span>
        {state.on && (
          <>
            <label className="mcp-switch">
              <input type="checkbox" className="mcp-readonly" checked={state.readOnly} onChange={(e) => set({ readOnly: e.target.checked })} /> {t(catalog, 'mcp.readOnly')}
            </label>
            <label className="mcp-switch">
              <input type="checkbox" className="mcp-paused" checked={state.paused} onChange={(e) => set({ paused: e.target.checked })} /> {t(catalog, 'mcp.paused')}
            </label>
            <div className="mcp-row">
              <span>{t(catalog, 'mcp.address')}</span>
              <code className="mcp-address">{state.address}</code>
              {copyButton('address', state.address)}
            </div>
            <div className="mcp-row">
              <span>{t(catalog, 'mcp.token')}</span>
              <code className="mcp-token">{shown ? state.token : hidden}</code>
              <button type="button" className="mcp-show" onClick={() => setShown(!shown)}>
                {t(catalog, shown ? 'mcp.hide' : 'mcp.show')}
              </button>
              {copyButton('token', state.token)}
              <button type="button" className="mcp-new-token" title={t(catalog, 'mcp.newTokenTip')} onClick={() => set({ newToken: true })}>
                {t(catalog, 'mcp.newToken')}
              </button>
            </div>
            <p className="hint">{t(catalog, 'mcp.secret')}</p>
            <div className="mcp-client">
              <div className="mcp-client-head">
                {t(catalog, 'mcp.claudeCode')} {copyButton('claude-code', claudeCode)}
              </div>
              <pre className="mcp-line">{shownLine(claudeCode)}</pre>
            </div>
            {stdio && (
              <div className="mcp-client">
                <div className="mcp-client-head">
                  {t(catalog, 'mcp.stdio')} {copyButton('stdio', stdio)}
                </div>
                <pre className="mcp-line mcp-stdio">{stdio}</pre>
              </div>
            )}
            <div className="mcp-client">
              <div className="mcp-client-head">
                {t(catalog, 'mcp.json')} {copyButton('json', json)}
              </div>
              <pre className="mcp-line">{shownLine(json)}</pre>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
