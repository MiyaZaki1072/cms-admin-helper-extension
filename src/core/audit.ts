/**
 * Audit log of every action that changes CMS: time, action, targets, result.
 * Kept in storage.local (newest last, capped). Content scripts send entries
 * to the background, which appends them one at a time so tabs cannot race.
 * Never put passwords in an entry.
 */
import { browser } from 'wxt/browser';
import { toCsv } from './csv';
import { request } from './messaging';

export type AuditResult = 'ok' | 'failed' | 'partial' | 'cancelled';

export interface AuditEntry {
  /** ms since epoch. */
  time: number;
  /** Short action name, e.g. "Bulk extra time". */
  action: string;
  contestId: number | null;
  /** Usernames, team codes, submission ids... */
  targets: string[];
  result: AuditResult;
  details?: string;
}

const KEY = 'audit';
export const AUDIT_MAX_ENTRIES = 5000;

export async function readAudit(): Promise<AuditEntry[]> {
  return ((await browser.storage.local.get(KEY))[KEY] as AuditEntry[] | undefined) ?? [];
}

/** Background only: append and trim. */
export async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const entries = await readAudit();
  entries.push(entry);
  await browser.storage.local.set({ [KEY]: entries.slice(-AUDIT_MAX_ENTRIES) });
}

export async function clearAudit(): Promise<void> {
  await browser.storage.local.set({ [KEY]: [] });
}

/** From a content script: record an action. */
export async function logAudit(entry: Omit<AuditEntry, 'time'>): Promise<void> {
  await request({ type: 'audit:add', entry: { ...entry, time: Date.now() } });
}

export function auditToCsv(entries: readonly AuditEntry[]): string {
  return toCsv([
    ['time_utc', 'action', 'contest_id', 'targets', 'result', 'details'],
    ...entries.map((e) => [
      new Date(e.time).toISOString(),
      e.action,
      e.contestId ?? '',
      e.targets.join(' '),
      e.result,
      e.details ?? '',
    ]),
  ]);
}

export function onAuditChanged(listener: (entries: AuditEntry[]) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && KEY in changes) listener((changes[KEY]?.newValue as AuditEntry[] | undefined) ?? []);
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
