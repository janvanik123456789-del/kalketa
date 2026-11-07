/**
 * The conversation window of Kalketa, apart from the context window of the model (as programming assistants keep it).
 * A model reads the whole conversation with every question; a long one fills its context and, on a local model,
 * takes minutes to read. So the turns sent are kept under a limit: when they grow past it, the older part is summed
 * up once by the model and only the summary and the newest turns go on. The window moves by jumps, not by turns:
 * the summary stays word for word until the next jump, so the start of what is sent stays the same and a server
 * reads only what is new (its prefix cache).
 */

import type { ChatTurn } from './briefing.js';

/** The older turns of a conversation summed up: turns before `upTo` go as `summary`. */
export interface ConversationWindow {
  readonly upTo: number;
  readonly summary: string;
  /** ISO time it was made. */
  readonly time?: string;
}

/** Tokens a text takes, roughly: Czech and formulas run near three characters a token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Context sizes when the server does not say: Claude's, and a modest one of a local model. */
export const DEFAULT_CONTEXT = { remote: 200_000, local: 32_768 } as const;

/** What may be sent of the context: the rest is the room of the answer (and of the model's thinking). */
export const SEND_SHARE = 0.6;
/**
 * What a jump leaves of all that is sent (the briefing, the state of the sheet, the summary and the newest turns):
 * well under SEND_SHARE, so many questions fit before the next jump. A jump at every question would make the model
 * sum up each time and change the start of what is sent each time, which a server cannot read from its cache.
 */
export const KEEP_SHARE = 0.35;
/** Room the summary takes, roughly (it is asked for at most 400 words). */
const SUMMARY_TOKENS = 1000;

const SUMMARY_HEAD = 'Summary of the earlier part of this conversation (its messages are left out to keep the conversation short; the sheet as it is now comes with the latest question):';
const SUMMARY_ACK = 'Understood. I continue from this summary.';

/** What goes to the model of a conversation with a window: the summary as one exchange, then the turns after it. */
export function windowTurns(turns: readonly ChatTurn[], window: ConversationWindow | undefined): ChatTurn[] {
  if (!window || window.upTo <= 0 || window.upTo > turns.length) return [...turns];
  return [
    { role: 'user', text: `${SUMMARY_HEAD}\n${window.summary.trim()}` },
    { role: 'assistant', text: SUMMARY_ACK },
    ...turns.slice(window.upTo),
  ];
}

/** Tokens of what would be sent: the steady briefing and the state of the sheet (`fixed`), and the turns. */
export function sentTokens(turns: readonly ChatTurn[], window: ConversationWindow | undefined, fixed: number): number {
  return fixed + windowTurns(turns, window).reduce((n, t) => n + estimateTokens(t.sent ?? t.text) + estimateTokens(t.reasoning ?? '') + 4, 0);
}

/**
 * Where to cut when the conversation no longer fits: the first turn to keep, a question of the user (the summary
 * replaces everything before it), so that the turns kept take at most KEEP_SHARE of the context. Undefined while it
 * fits, or when no cut gains anything (the latest question alone is that long).
 */
export function planJump(turns: readonly ChatTurn[], window: ConversationWindow | undefined, fixed: number, context: number): number | undefined {
  if (sentTokens(turns, window, fixed) <= context * SEND_SHARE) return undefined;
  const lastQuestion = turns.map((t) => t.role).lastIndexOf('user');
  if (lastQuestion <= 0) return undefined;
  const from = window?.upTo ?? 0;
  let keep = 0;
  let cut: number | undefined;
  for (let i = turns.length - 1; i > from; i--) {
    keep += estimateTokens(turns[i]!.sent ?? turns[i]!.text) + estimateTokens(turns[i]!.reasoning ?? '') + 4;
    if (turns[i]!.role === 'user' && i <= lastQuestion) {
      // The briefing and the state of the sheet go anyway: the turns kept fit what they leave of KEEP_SHARE.
      if (fixed + SUMMARY_TOKENS + keep > context * KEEP_SHARE && cut !== undefined) break;
      cut = i;
    }
  }
  return cut !== undefined && cut > from ? cut : undefined;
}

/** What the model is asked to sum up the turns it is given, for itself, to go on without them. */
export function summaryInstruction(): string {
  return [
    'The conversation is getting long. Sum up everything above (with the earlier summary, if there is one) for yourself, so you can go on without these messages.',
    'In the language of the conversation, at most 400 words, short lines under these headings: What the user wants; Decided and done (accepted changes, with their lines as they are now); Checked (with the results); Open (questions, proposals not yet decided, what comes next).',
    'Keep names, numbers and units exactly as in the sheet. Write only what was said or done, nothing new. Plain text, no code blocks, no change blocks.',
    'Reply with the summary only.',
  ].join('\n');
}
