/**
 * Contest-day actions: announcements, question replies, live status,
 * re-evaluation by task or contest, ranking snapshots, submission zips.
 * Writes are checked against the page AWS redirects to and are audited.
 */
import { zipSync, strToU8 } from 'fflate';
import { logAudit } from '@/core/audit';
import { type AwsClient, RpcError } from '@/core/aws-client';
import type { Question, Submission } from '@/core/model';
import { parseAnnouncements, parseQuestions } from '@/core/parsers';
import { runPool } from '@/features/import/runner';

async function audited<T>(entry: { action: string; contestId: number; targets: string[]; details?: string }, run: () => Promise<T>): Promise<T> {
  try {
    const value = await run();
    await logAudit({ ...entry, result: 'ok' });
    return value;
  } catch (err) {
    await logAudit({ ...entry, result: 'failed', details: `${entry.details ? `${entry.details}: ` : ''}${String(err)}` });
    throw err;
  }
}

export function postAnnouncement(client: AwsClient, contestId: number, subject: string, text: string): Promise<void> {
  return audited({ action: 'Announcement', contestId, targets: ['all contestants'], details: subject }, async () => {
    if (!subject.trim()) throw new Error('The subject is required.');
    const result = await client.postForm(`contest/${contestId}/announcements/add`, { subject, text });
    const posted = result.doc ? parseAnnouncements(result.doc) : [];
    if (!posted.some((a) => a.subject === subject.trim() && a.text === text.trim())) {
      throw new Error('AWS did not show the announcement after posting.');
    }
  });
}

export type QuickAnswer = 'yes' | 'no' | 'answered' | 'invalid' | 'nocomment' | 'other';

export const QUICK_ANSWERS: Record<QuickAnswer, string> = {
  yes: 'Yes',
  no: 'No',
  answered: 'Answered in task description',
  invalid: 'Invalid question',
  nocomment: 'No comment',
  other: 'Write an answer',
};

export function replyToQuestion(client: AwsClient, contestId: number, question: Question, answer: QuickAnswer, text: string): Promise<void> {
  if (question.id === null) return Promise.reject(new Error('This question has no id (no permission to reply).'));
  const id = question.id;
  return audited({ action: 'Reply to question', contestId, targets: [question.username], details: question.subject }, async () => {
    const result = await client.postForm(`contest/${contestId}/question/${id}/reply`, {
      reply_question_quick_answer: answer,
      reply_question_text: answer === 'other' ? text : '',
    });
    const after = result.doc ? parseQuestions(result.doc).find((q) => q.id === id) : undefined;
    if (!after?.answered) throw new Error('AWS did not record the reply.');
  });
}

export interface LiveStatus {
  submissions: Record<string, number> | null;
  queueLength: number | null;
  workers: { total: number; connected: number; busy: number } | null;
  errors: string[];
}

export async function fetchStatus(client: AwsClient, contestId: number): Promise<LiveStatus> {
  const errors: string[] = [];
  const safe = async <T>(run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (err) {
      errors.push(err instanceof RpcError ? err.message : String(err));
      return null;
    }
  };
  const [submissions, queue, workers] = await Promise.all([
    safe(() => client.rpc<Record<string, number>>('AdminWebServer', 0, 'submissions_status', { contest_id: contestId })),
    safe(() => client.rpc<unknown[]>('EvaluationService', 0, 'queue_status', {})),
    safe(() => client.rpc<Record<string, { connected: boolean; operations: unknown }>>('EvaluationService', 0, 'workers_status', {})),
  ]);
  const list = workers ? Object.values(workers) : null;
  return {
    submissions,
    queueLength: queue ? queue.length : null,
    workers: list
      ? {
          total: list.length,
          connected: list.filter((w) => w.connected).length,
          busy: list.filter((w) => w.operations !== null && w.operations !== undefined && (!Array.isArray(w.operations) || w.operations.length > 0)).length,
        }
      : null,
    errors,
  };
}

export type ReevalLevel = 'compilation' | 'evaluation';

export function reevaluateTask(client: AwsClient, contestId: number, task: { name: string; datasetId: number }, level: ReevalLevel): Promise<void> {
  return audited({ action: `Re-evaluate task (${level})`, contestId, targets: [task.name] }, async () => {
    await client.rpc('EvaluationService', 0, 'invalidate_submission', { dataset_id: task.datasetId, level });
  });
}

export function reevaluateContest(client: AwsClient, contestId: number, level: ReevalLevel): Promise<void> {
  return audited({ action: `Re-evaluate whole contest (${level})`, contestId, targets: ['all submissions'] }, async () => {
    await client.rpc('EvaluationService', 0, 'invalidate_submission', { contest_id: contestId, level });
  });
}

export function fetchRankingCsv(client: AwsClient, contestId: number): Promise<string> {
  return client.getText(`contest/${contestId}/ranking/csv`);
}

export type PickMode = 'best' | 'last';

/** One submission per contestant per task: the best-scoring (latest on ties) or the last one. */
export function pickSubmissions(submissions: readonly Submission[], mode: PickMode, taskId: number | null): Submission[] {
  const picked = new Map<string, Submission>();
  for (const s of submissions) {
    if (!s.official || (taskId !== null && s.taskId !== taskId)) continue;
    const key = `${s.userId}:${s.taskId}`;
    const current = picked.get(key);
    const better =
      !current ||
      (mode === 'last'
        ? s.timestamp > current.timestamp
        : (s.score ?? -1) > (current.score ?? -1) || ((s.score ?? -1) === (current.score ?? -1) && s.timestamp > current.timestamp));
    if (better) picked.set(key, s);
  }
  return [...picked.values()].sort((a, b) => a.taskName.localeCompare(b.taskName) || a.username.localeCompare(b.username));
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_');

/** Zip the source files of `submissions` as task/username_id_file. */
export async function buildSubmissionZip(
  client: AwsClient,
  submissions: readonly Submission[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const jobs = submissions.flatMap((s) => s.files.map((f) => ({ s, f })));
  let done = 0;
  await runPool(
    jobs,
    2,
    async ({ s, f }) => {
      const text = await client.getText(`submission_file/${f.fileId}`, { signal });
      files[`${safeName(s.taskName)}/${safeName(s.username)}_${s.id}_${safeName(f.name)}`] = strToU8(text);
      onProgress?.(++done, jobs.length);
    },
    signal,
  );
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: 'application/zip' });
}
