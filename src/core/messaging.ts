/**
 * Request/response messages from content scripts to the background worker.
 * Uses sendResponse (not a returned Promise) so it works in Chrome and Firefox.
 */
import { browser } from 'wxt/browser';
import type { AuditEntry } from './audit';
import type { Submission } from './model';

export interface TrackerMeta {
  /** ms since epoch of the last finished sync. */
  lastSyncAt: number | null;
  /** True once a full walk of every page has finished. */
  complete: boolean;
  /** Total submissions AWS reported at the last sync. */
  total: number | null;
}

export type BackgroundRequest =
  | { type: 'audit:add'; entry: AuditEntry }
  | { type: 'tracker:load'; contestId: number }
  | { type: 'tracker:save'; contestId: number; put: Submission[]; remove: number[]; meta: TrackerMeta }
  | { type: 'tracker:clear'; contestId: number }
  | { type: 'xlsx:write'; sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }> }
  | { type: 'xlsx:read'; base64: string; sheet?: string }
  | { type: 'notify'; title: string; message: string };

export interface BackgroundResponses {
  'audit:add': null;
  'tracker:load': { submissions: Submission[]; meta: TrackerMeta };
  'tracker:save': null;
  'tracker:clear': null;
  'xlsx:write': { base64: string };
  'xlsx:read': { sheets: string[]; rows: string[][] };
  notify: null;
}

type Reply<T> = { ok: true; value: T } | { ok: false; error: string };

export async function request<R extends BackgroundRequest>(message: R): Promise<BackgroundResponses[R['type']]> {
  const reply = (await browser.runtime.sendMessage(message)) as Reply<BackgroundResponses[R['type']]> | undefined;
  if (!reply) throw new Error('The extension background did not answer. Reload the page and try again.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.value;
}

/** Context the background knows about the sender. */
export interface SenderInfo {
  /** Origin of the tab that sent the message (the AWS origin). */
  origin: string;
}

type Handlers = {
  [K in BackgroundRequest['type']]: (
    message: Extract<BackgroundRequest, { type: K }>,
    sender: SenderInfo,
  ) => Promise<BackgroundResponses[K]>;
};

const TYPES = new Set<string>(['audit:add', 'tracker:load', 'tracker:save', 'tracker:clear', 'xlsx:write', 'xlsx:read', 'notify']);

function isRequest(value: unknown): value is BackgroundRequest {
  return typeof value === 'object' && value !== null && TYPES.has((value as { type?: string }).type ?? '');
}

/** Background only: answer requests from our own content scripts. */
export function handleRequests(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (reply: unknown) => void) => {
    if (sender.id !== browser.runtime.id || !isRequest(message)) return false;
    const url = sender.url ?? sender.tab?.url;
    if (!url) return false;
    const handler = handlers[message.type] as (m: BackgroundRequest, s: SenderInfo) => Promise<unknown>;
    handler(message, { origin: new URL(url).origin }).then(
      (value) => sendResponse({ ok: true, value: value ?? null }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  });
}
