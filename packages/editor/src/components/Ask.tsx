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
  | { readonly kind: 'confirm'; readonly label: string; resolve(value: boolean): void };

let open: ((request: Request) => void) | undefined;

/** Asks for a text; undefined when cancelled. */
export function ask(label: string, initial = ''): Promise<string | undefined> {
  return new Promise((resolve) => (open ? open({ kind: 'text', label, initial, resolve }) : resolve(undefined)));
}

/** Asks a yes/no question. */
export function askConfirm(label: string): Promise<boolean> {
  return new Promise((resolve) => (open ? open({ kind: 'confirm', label, resolve }) : resolve(false)));
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
    else request.resolve(ok);
  };
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
