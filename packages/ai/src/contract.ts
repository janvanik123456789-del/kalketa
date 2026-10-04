/**
 * The contract between the program and the AI module (docs/01-filozofie.md, ch. 9.1).
 *
 * The program knows only this: a task goes in with the context of the sheet,
 * proposals come out. Providers, models, prompts and the shape of any API stay
 * inside the module, so the module can be replaced as a whole. The program
 * still checks every proposal with the core and a person accepts or rejects it.
 *
 * A change that breaks the meaning of a field raises the version.
 */

export const AI_CONTRACT_VERSION = 1;

/** What the program asks for. */
export type AiTaskKind =
  /** Review the sheet: missing checks, suspicious values, formulas against cited sources. */
  | 'check'
  /** Explain a value or a part of the calculation. */
  | 'explain'
  /** Propose formulas or blocks for what the user describes. */
  | 'propose'
  /** Turn a manufacturer's catalogue (text or picture) into a typed table. */
  | 'table';

/** The part of the sheet the model may see; the program decides what goes in. */
export interface AiSheetContext {
  readonly title: string;
  /** Text of the calculation, in the sheet language. */
  readonly source: string;
  /** Diagnostics and checks as codes, e.g. "E_UNIT_MISMATCH line 12". */
  readonly findings?: readonly string[];
  /** Theory the author chose (the sources layers, theory libraries), by section; cited as [T3] or [PP:T3]. */
  readonly theory?: readonly { readonly id?: string; readonly title: string; readonly text: string }[];
  /** Theory libraries the sheet uses: their key and where their text comes from. */
  readonly libraries?: readonly { readonly key: string; readonly title: string; readonly source: string }[];
  /** Changes the AI proposed for the sheet and what the user decided, oldest first (the journal, ch. 9.7). */
  readonly changes?: readonly AiChangeRecord[];
}

/** A proposed change as the journal keeps it: lines as numbered when it was proposed. */
export interface AiChangeRecord {
  readonly from: number;
  readonly to: number;
  readonly insert?: boolean;
  readonly before?: readonly string[];
  readonly after: readonly string[];
  readonly state: 'open' | 'accepted' | 'rejected';
  /** ISO time it was proposed, and decided. */
  readonly time: string;
  readonly decided?: string;
  /** ISO time a person reviewed the accepted lines. */
  readonly reviewed?: string;
  /** Accepted into a copy of the sheet with this title; this sheet stayed as it was. */
  readonly copiedTo?: string;
}

export interface AiRequest {
  readonly contract: typeof AI_CONTRACT_VERSION;
  readonly task: AiTaskKind;
  readonly sheet: AiSheetContext;
  /** What the user wrote, if the task came from them. */
  readonly prompt?: string;
}

/** One proposal. Nothing changes the calculation until a person accepts it. */
export type AiProposal =
  /** A note for the AI layer; the only thing written without approval. */
  | { readonly kind: 'note'; readonly text: string; readonly line?: number }
  /** Replace lines of the calculation. */
  | { readonly kind: 'change'; readonly fromLine: number; readonly toLine: number; readonly text: string; readonly reason: string }
  /** A new table, with where its values come from. */
  | { readonly kind: 'table'; readonly name: string; readonly csv: string; readonly source: string };

export interface AiResult {
  readonly contract: typeof AI_CONTRACT_VERSION;
  readonly proposals: readonly AiProposal[];
  /** Which model answered; stored with every accepted proposal. */
  readonly model: string;
}
