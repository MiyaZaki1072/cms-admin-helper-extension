/**
 * Bulk participation edits (extra time, hidden/unrestricted, IP from a seat
 * map) and bulk private messages. Participation edits read the current
 * form, change only the target fields and POST everything back.
 */
import { logAudit } from '@/core/audit';
import type { AwsClient } from '@/core/aws-client';
import { formatDuration } from '@/core/duration';
import type { ParticipationForm } from '@/core/model';
import { parseParticipationForm, parseParticipationPage, setCheckbox, setField } from '@/core/parsers';
import { PARTICIPATION } from '@/core/parsers/selectors';
import { parseText } from '@/features/import/parse';
import { runPool } from '@/features/import/runner';
import { checkIpList } from '@/features/import/validate';
import { normalizeIps } from '@/features/import/writes';
import { type PlaceholderValues, fillPlaceholders } from './templates';

export interface ParticipationChange {
  /** Seconds to add (negative to remove); the result never goes below 0. */
  extraTimeDelta?: number;
  hidden?: boolean;
  unrestricted?: boolean;
  ip?: string;
}

export interface Target {
  userId: number;
  username: string;
}

export interface EditOutcome extends Target {
  state: 'done' | 'failed';
  before: string;
  after: string;
  message: string;
}

export function describeParticipation(p: ParticipationForm): string {
  const parts = [`extra ${formatDuration(p.extraTime)}`];
  if (p.ip) parts.push(`IP ${p.ip}`);
  if (p.hidden) parts.push('hidden');
  if (p.unrestricted) parts.push('unrestricted');
  return parts.join(', ');
}

export async function editParticipation(
  client: AwsClient,
  contestId: number,
  userId: number,
  change: ParticipationChange,
  signal?: AbortSignal,
): Promise<{ before: ParticipationForm; after: ParticipationForm }> {
  const path = `contest/${contestId}/user/${userId}/edit`;
  const { doc } = await client.getPage(path, { signal });
  const formEl = doc.querySelector<HTMLFormElement>(PARTICIPATION.form);
  if (!formEl) throw new Error('Participation form not found');
  const { form: before, fields: original } = parseParticipationForm(formEl);
  let fields = original;
  const want: Partial<ParticipationForm> = {};
  if (change.extraTimeDelta !== undefined) {
    want.extraTime = Math.max(0, before.extraTime + change.extraTimeDelta);
    fields = setField(fields, 'extra_time', String(want.extraTime));
  }
  if (change.hidden !== undefined) {
    want.hidden = change.hidden;
    fields = setCheckbox(fields, 'hidden', change.hidden);
  }
  if (change.unrestricted !== undefined) {
    want.unrestricted = change.unrestricted;
    fields = setCheckbox(fields, 'unrestricted', change.unrestricted);
  }
  if (change.ip !== undefined) {
    want.ip = change.ip;
    fields = setField(fields, 'ip', change.ip);
  }
  const result = await client.postForm(path, fields, { multipart: true, signal });
  const after = result.doc ? parseParticipationPage(result.doc).form : null;
  const kept =
    after !== null &&
    (want.extraTime === undefined || after.extraTime === want.extraTime) &&
    (want.hidden === undefined || after.hidden === want.hidden) &&
    (want.unrestricted === undefined || after.unrestricted === want.unrestricted) &&
    (want.ip === undefined || normalizeIps(after.ip) === normalizeIps(want.ip));
  if (!kept || !after) {
    const notes = await client.readNotifications().catch(() => []);
    throw new Error(notes.map((n) => `${n.subject} ${n.text}`.trim()).join(' | ') || 'AWS did not keep the change');
  }
  // Nothing else may change: the team and password must be as before.
  if (after.team !== before.team || after.method !== before.method) throw new Error('Another field changed unexpectedly; check the participation page.');
  return { before, after };
}

export async function bulkEditParticipations(
  client: AwsClient,
  contestId: number,
  targets: readonly Target[],
  change: ParticipationChange | ((t: Target) => ParticipationChange),
  options: { action: string; details: string; onRow?: (o: EditOutcome) => void; signal?: AbortSignal },
): Promise<EditOutcome[]> {
  const outcomes: EditOutcome[] = [];
  await runPool(
    targets,
    2,
    async (t) => {
      const o: EditOutcome = { ...t, state: 'done', before: '', after: '', message: '' };
      try {
        const { before, after } = await editParticipation(client, contestId, t.userId, typeof change === 'function' ? change(t) : change, options.signal);
        o.before = describeParticipation(before);
        o.after = describeParticipation(after);
      } catch (err) {
        o.state = 'failed';
        o.message = err instanceof Error ? err.message : String(err);
      }
      outcomes.push(o);
      options.onRow?.(o);
    },
    options.signal,
  );
  await auditBulk(options.action, contestId, outcomes, options.details, targets.length);
  return outcomes;
}

async function auditBulk(action: string, contestId: number, outcomes: ReadonlyArray<{ username: string; state: string }>, details: string, planned: number) {
  const done = outcomes.filter((o) => o.state === 'done');
  const failed = outcomes.length - done.length;
  await logAudit({
    action,
    contestId,
    targets: done.map((o) => o.username),
    result: failed === 0 && outcomes.length === planned ? 'ok' : done.length > 0 ? 'partial' : outcomes.length === 0 ? 'cancelled' : 'failed',
    details: `${details}; ${done.length} done, ${failed} failed${outcomes.length < planned ? `, ${planned - outcomes.length} not run` : ''}`,
  });
}

export interface MessageTarget extends Target, PlaceholderValues {}

export interface MessageOutcome extends Target {
  state: 'done' | 'failed';
  subject: string;
  message: string;
}

/** One private message per contestant, with {username} etc. filled in. */
export async function bulkMessage(
  client: AwsClient,
  contestId: number,
  targets: readonly MessageTarget[],
  subject: string,
  text: string,
  options: { onRow?: (o: MessageOutcome) => void; signal?: AbortSignal } = {},
): Promise<MessageOutcome[]> {
  const outcomes: MessageOutcome[] = [];
  await runPool(
    targets,
    2,
    async (t) => {
      const s = fillPlaceholders(subject, t).trim();
      const body = fillPlaceholders(text, t).trim();
      const o: MessageOutcome = { userId: t.userId, username: t.username, state: 'done', subject: s, message: '' };
      try {
        const result = await client.postForm(`contest/${contestId}/user/${t.userId}/message`, { message_subject: s, message_text: body }, { signal: options.signal });
        const page = result.doc ? parseParticipationPage(result.doc) : null;
        if (!page?.messages.some((m) => m.subject === s && m.text === body)) throw new Error('AWS did not show the message after sending');
      } catch (err) {
        o.state = 'failed';
        o.message = err instanceof Error ? err.message : String(err);
      }
      outcomes.push(o);
      options.onRow?.(o);
    },
    options.signal,
  );
  await auditBulk('Bulk message', contestId, outcomes, subject, targets.length);
  return outcomes;
}

export interface SeatRow {
  line: number;
  username: string;
  ip: string;
  error: string | null;
}

/** Seat map CSV: username,ip (a header row is optional). */
export function parseSeatMap(text: string): SeatRow[] {
  const rows = parseText(text);
  const start = rows[0] && /user/i.test(rows[0][0] ?? '') ? 1 : 0;
  return rows.slice(start).map((r, i) => {
    const username = (r[0] ?? '').trim();
    const [ip, errors] = checkIpList(r[1] ?? '');
    return {
      line: i + start + 1,
      username,
      ip,
      error: !username ? 'Username is empty' : !ip ? 'IP is empty' : (errors[0] ?? null),
    };
  });
}
