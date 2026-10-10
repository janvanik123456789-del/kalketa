/**
 * The AI part of the Settings dialog: provider, model and API key. Everything
 * works without it; it is off until the user picks a provider. The key goes to
 * the desktop application and never comes back to the editor. Local servers
 * (LM Studio, Ollama) need no key: the dialog finds those that run and asks
 * them for their models as soon as one is picked.
 */
import { useEffect, useState } from 'react';
import { AI_EFFORTS, AI_OFF, DEFAULT_THINKING_LIMIT, THINKING_LIMITS, allowedProviders, isLoopback, modelAllowed, NO_POLICY, parseAiPolicy, providerById, type AiPolicy, type AiSettings, type ModelChoice, type ProviderInfo } from '@kalketa/ai';
import { formatNumber, t, type Catalog, type UiKey } from '@kalketa/i18n';
import { desktop, type AiKeyState } from '../document.js';

/** What the dialog keeps until OK: the settings and a newly typed key. */
export interface AiDraft {
  readonly settings: AiSettings;
  readonly key: string;
  readonly remember: boolean;
}

export function AiSettingsSection({ catalog, draft, onChange, aiOn = true }: { catalog: Catalog; draft: AiDraft; onChange(draft: AiDraft): void; aiOn?: boolean }) {
  const [policy, setPolicy] = useState<AiPolicy>(NO_POLICY);
  const [keyState, setKeyState] = useState<AiKeyState>();
  const [models, setModels] = useState<readonly ModelChoice[]>();
  const [status, setStatus] = useState<string>();
  const [running, setRunning] = useState<Readonly<Record<string, unknown>>>({});
  const provider = providerById(draft.settings.provider);
  // A server at an address the user gives has no product name: it is named in the UI language.
  const nameOf = (p: ProviderInfo) => (p.urlEditable ? t(catalog, 'ai.otherServer') : p.name);
  // The field shows the address in full, editable; only one other than the default is
  // sent, so the application keeps its own default (and the smoke test its fake server).
  const shownUrl = provider?.urlEditable ? (draft.settings.url ?? provider.baseUrl ?? '') : '';
  const url = provider?.urlEditable && shownUrl.trim() !== provider.baseUrl ? shownUrl.trim() : undefined;

  useEffect(() => {
    void desktop?.aiPolicy().then((p) => setPolicy(parseAiPolicy(p)));
    // Looking for running servers sends requests: only with the AI switched on.
    if (aiOn) void desktop?.aiDiscover().then(setRunning);
  }, []);
  useEffect(() => {
    setKeyState(undefined);
    setModels(undefined);
    setStatus(undefined);
    if (!provider) return;
    void desktop?.aiKeyState(provider.id).then(setKeyState);
    if (provider.local && aiOn) void test();
    // Runs when another provider is picked, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  if (!desktop) return <p className="hint">{t(catalog, 'ai.desktopOnly')}</p>;
  if (policy.disabled) return <p className="hint">{t(catalog, 'ai.disabledByPolicy')}</p>;

  const setSettings = (settings: AiSettings) => onChange({ ...draft, settings });
  const choices = (models ?? provider?.models ?? []).filter((m) => modelAllowed(policy, m.id));
  // A model picked earlier stays in the list even when the provider no longer offers it.
  const shown = provider && !choices.some((m) => m.id === draft.settings.model) ? [{ id: draft.settings.model, name: draft.settings.model || t(catalog, 'ai.firstModel') }, ...choices] : choices;

  /**
   * Asks for the models; with `ask`, a model of a local server also answers one
   * short question, so the user sees it work (Claude is not asked: answers cost).
   */
  async function test(ask = false) {
    if (!provider) return;
    setStatus(t(catalog, 'ai.testing'));
    if (draft.key.trim()) {
      setKeyState(await desktop!.aiSetKey({ provider: provider.id, key: draft.key, remember: draft.remember }));
      onChange({ ...draft, key: '' });
    }
    const result = await desktop!.aiTest(provider.id, url);
    if (result.ok) {
      setModels(result.models);
      setStatus(t(catalog, 'ai.connected', { count: String(result.models.length) }));
      // A local server offers what it has: without a choice yet, its first model.
      const first = result.models.find((m) => modelAllowed(policy, m.id));
      const keep = result.models.some((m) => m.id === draft.settings.model);
      if (first && !keep) onChange({ ...draft, key: '', settings: { ...draft.settings, provider: provider.id, model: first.id } });
      const model = keep ? draft.settings.model : first?.id;
      if (ask && model && provider.api === 'openai-compatible') {
        setStatus(t(catalog, 'ai.asking', { model }));
        const answer = await desktop!.aiTry(provider.id, model, url);
        if (answer.ok) {
          const seconds = new Intl.NumberFormat(catalog.locale, { maximumFractionDigits: 1 }).format(answer.ms / 1000);
          setStatus(t(catalog, 'ai.answered', { model, seconds, reply: answer.reply || '…' }));
        } else {
          setStatus(t(catalog, `ai.problem.${answer.problem}` as UiKey, { detail: answer.detail ?? '', name: nameOf(provider) }));
        }
      }
    } else {
      setStatus(t(catalog, `ai.problem.${result.problem}` as UiKey, { detail: result.detail ?? '', name: nameOf(provider) }));
    }
  }

  const forget = async () => {
    if (!provider) return;
    setKeyState(await desktop!.aiForgetKey(provider.id));
    setStatus(undefined);
  };

  return (
    <div className="ai-settings">
      <h4>{t(catalog, 'ai.section')}</h4>
      <label className="field">
        <span>{t(catalog, 'ai.provider')}</span>
        <select
          value={draft.settings.provider}
          onChange={(e) => {
            const next = providerById(e.target.value);
            setSettings(next ? { provider: next.id, model: next.defaultModel } : { provider: AI_OFF, model: '' });
          }}
        >
          <option value={AI_OFF}>{t(catalog, 'ai.off')}</option>
          {allowedProviders(policy).map((p) => (
            <option key={p.id} value={p.id}>
              {p.local ? `${nameOf(p)} – ${t(catalog, p.id in running ? 'ai.localRunning' : p.urlEditable ? 'ai.anyAddress' : 'ai.local')}` : p.name}
            </option>
          ))}
        </select>
      </label>
      {provider && (
        <>
          {provider.urlEditable && (
            <label className="field">
              <span>{t(catalog, 'ai.url')}</span>
              <input
                type="text"
                className="ai-url"
                spellCheck={false}
                value={shownUrl}
                onChange={(e) => setSettings({ ...draft.settings, url: e.target.value })}
                onBlur={() => void test()}
              />
            </label>
          )}
          <label className="field">
            <span>{t(catalog, 'ai.model')}</span>
            <select value={draft.settings.model} onChange={(e) => setSettings({ ...draft.settings, model: e.target.value })}>
              {shown.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t(catalog, 'ai.effort')}</span>
            <select
              className="ai-effort"
              value={draft.settings.effort ?? ''}
              onChange={(e) => {
                const effort = AI_EFFORTS.find((x) => x === e.target.value);
                const { effort: _old, ...rest } = draft.settings;
                setSettings(effort ? { ...rest, effort } : rest);
              }}
            >
              <option value="">{t(catalog, 'ai.effortDefault')}</option>
              {AI_EFFORTS.filter((e) => e !== 'none' || provider.api === 'openai-compatible').map((e) => (
                <option key={e} value={e}>
                  {t(catalog, `ai.effort.${e}` as UiKey)}
                </option>
              ))}
            </select>
          </label>
          {provider.api === 'openai-compatible' && draft.settings.effort !== 'none' && (
            // A local model thinking past this is asked again without thinking: an answer in minutes, not none after ten.
            <label className="field">
              <span>{t(catalog, 'ai.thinkingLimit')}</span>
              <select
                className="ai-thinking-limit"
                value={draft.settings.thinkingLimit ?? DEFAULT_THINKING_LIMIT}
                onChange={(e) => setSettings({ ...draft.settings, thinkingLimit: Number(e.target.value) })}
              >
                {THINKING_LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t(catalog, 'ai.thinkingLimit.0') : t(catalog, 'ai.thinkingLimit.n', { n: formatNumber(n, catalog) })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {provider.needsKey && (
            <>
              <label className="field">
                <span>{t(catalog, 'ai.key')}</span>
                <input
                  type="password"
                  className="ai-key"
                  autoComplete="off"
                  spellCheck={false}
                  value={draft.key}
                  placeholder={keyState?.hasKey ? t(catalog, 'ai.keySet') : ''}
                  onChange={(e) => onChange({ ...draft, key: e.target.value })}
                />
              </label>
              <label className="field">
                <span />
                <span>
                  <input type="checkbox" className="ai-remember" checked={draft.remember && keyState?.canRemember !== false} disabled={keyState?.canRemember === false} onChange={(e) => onChange({ ...draft, remember: e.target.checked })} />{' '}
                  {t(catalog, keyState?.canRemember === false ? 'ai.cannotRemember' : 'ai.remember')}
                </span>
              </label>
            </>
          )}
          <div className="ai-actions">
            <button type="button" className="ai-test" onClick={() => void test(true)} disabled={provider.needsKey && !draft.key.trim() && !keyState?.hasKey}>
              {t(catalog, 'ai.test')}
            </button>
            {keyState?.hasKey && (
              <button type="button" className="ai-forget" onClick={() => void forget()}>
                {t(catalog, 'ai.forget')}
              </button>
            )}
            {provider.keyUrl && (
              <a href={provider.keyUrl} target="_blank" rel="noreferrer">
                {t(catalog, 'ai.getKey')}
              </a>
            )}
          </div>
          {status && <p className="hint ai-status">{status}</p>}
          {provider.local && <p className="hint">{t(catalog, url === undefined || isLoopback(url) ? 'ai.localHint' : 'ai.remoteHint')}</p>}
        </>
      )}
      <p className="hint">{t(catalog, 'ai.hint')}</p>
    </div>
  );
}
