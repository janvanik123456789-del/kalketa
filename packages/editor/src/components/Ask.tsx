/**
 * Asking the user for a short text or a yes/no answer in the program's own
 * dialog. window.prompt does not exist in the desktop application (Electron),
 * and native dialogs would not follow the program language anyway.
 */

import { useEffect, useState } from 'react';
import type { Catalog } from '@kalketa/i18n';
import { Dialog } from './Dialogs.js';

type Request =
  | { readonly kind: 'text'; readonly label: string; readonly initial: string; resolve(value: string | undefined): void }
  | { readonly kind: 'confirm'; readonly label: string; resolve(value: boolean): void }
  | { readonly kind: 'choice'; readonly label: string; readonly choices: readonly string[]; resolve(index: number | undefined): void };

let open: ((request: Request) => void) | undefined;

/** Asks for a text; undefined when cancelled. */
export function ask(label: string, initial = ''): Promise<string | undefined> {
  return new Promise((resolve) => (open ? open({ kind: 'text', label, initial, resolve }) : resolve(undefined)));
}

/** Asks a yes/no question. */
export function askConfirm(label: string): Promise<boolean> {
  return new Promise((resolve) => (open ? open({ kind: 'confirm', label, resolve }) : resolve(false)));
}

/** Asks to choose one of a few answers (Save, Don't save, Cancel): its index, undefined when closed. The first is the default. */
export function askChoice(label: string, choices: readonly string[]): Promise<number | undefined> {
  return new Promise((resolve) => (open ? open({ kind: 'choice', label, choices, resolve }) : resolve(undefined)));
}

/** Shows the questions; placed once in the application. */
export function AskHost({ catalog, title }: { catalog: Catalog; title: string }) {
  const [request, setRequest] = useState<Request | undefined>();
  const [value, setValue] = useState('');

  useEffect(() => {
    open = (next) => {
      setValue(next.kind === 'text' ? next.initial : '');
      setRequest(next);
    };
    return () => {
      open = undefined;
    };
  }, []);

  if (!request) return null;
  const finish = (ok: boolean) => {
    setRequest(undefined);
    if (request.kind === 'text') request.resolve(ok ? value : undefined);
    else if (request.kind === 'choice') request.resolve(ok ? 0 : undefined);
    else request.resolve(ok);
  };
  if (request.kind === 'choice') {
    const choose = (i: number) => {
      setRequest(undefined);
      request.resolve(i);
    };
    return (
      <Dialog title={title} catalog={catalog} onClose={() => finish(false)} onOk={() => choose(0)} buttons={request.choices.map((label, i) => ({ label, run: () => choose(i), ...(i === 0 ? { isDefault: true } : {}) }))}>
        <p className="ask">{request.label}</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={title} catalog={catalog} onClose={() => finish(false)} onOk={() => finish(true)}>
      {request.kind === 'text' ? (
        <label className="ask">
          <span>{request.label}</span>
          <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
      ) : (
        <p className="ask">{request.label}</p>
      )}
    </Dialog>
  );
}
