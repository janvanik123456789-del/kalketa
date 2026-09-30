/**
 * Taking a finished calculation into the sheet as a block (docs/01-filozofie.md,
 * ch. 6.2). The block's text is copied into the sheet, so the sheet keeps
 * everything it uses; its "input" lines become the arguments of the call.
 */

import { blockVersion } from '@calccanvas/core';
import { t, type Catalog } from '@calccanvas/i18n';
import { readSheetFile, toIdentifier, type SheetDocument } from '@calccanvas/sheet';
import { ask, askConfirm } from './components/Ask.js';
import { chooseFile } from './document.js';
import { blockCall } from './logic/blocks.js';

export interface BlockChange {
  readonly doc: SheetDocument;
  readonly name: string;
  /** The call with the block's own input values, e.g. "Prosty_nosnik(L: 5 m, q: 12 kN/m)". */
  readonly call: string;
}

/** Lets the user pick a .calc or .cc file and adds its calculation as a block. */
export async function importBlockFile(doc: SheetDocument, catalog: Catalog): Promise<BlockChange | { readonly failed: string } | undefined> {
  const file = await chooseFile('.calc,.cc');
  if (!file) return undefined;
  let source: string;
  if (file.name.toLowerCase().endsWith('.calc')) {
    const read = await readSheetFile(new Uint8Array(await file.arrayBuffer()));
    if (!read.document) return { failed: file.name };
    source = read.document.source;
  } else {
    source = await file.text();
  }

  const heading = /^[ \t]*#(?!#)[ \t]*(.+?)[ \t]*$/m.exec(source)?.[1];
  const suggested = toIdentifier(heading ?? file.name.replace(/\.[^.]+$/, ''));
  const name = toIdentifier((await ask(t(catalog, 'blocks.name'), suggested)) ?? '');
  if (!name) return undefined;
  if (doc.blocks.has(name) && !(await askConfirm(t(catalog, 'blocks.replace', { name })))) return undefined;

  const blocks = new Map(doc.blocks);
  blocks.set(name, { source, version: blockVersion(source), origin: file.name });
  return { doc: { ...doc, blocks }, name, call: blockCall(name, source) };
}
