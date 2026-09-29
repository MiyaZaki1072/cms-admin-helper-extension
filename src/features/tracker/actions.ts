/**
 * Row quick actions. Every write is recorded in the audit log.
 */
import { logAudit } from '@/core/audit';
import type { AwsClient } from '@/core/aws-client';
import type { Participation } from '@/core/model';
import { parseParticipationPage } from '@/core/parsers';

export type ReevaluationLevel = 'compilation' | 'evaluation';

export function fetchParticipation(client: AwsClient, contestId: number, userId: number): Promise<Participation> {
  return client.getPage(`contest/${contestId}/user/${userId}/edit`).then(({ doc }) => parseParticipationPage(doc));
}

/** Re-evaluate every submission of one participation, as AWS's C/E buttons do. */
export async function reevaluateParticipation(
  client: AwsClient,
  target: { contestId: number; participationId: number; username: string },
  level: ReevaluationLevel,
): Promise<void> {
  try {
    await client.rpc('EvaluationService', 0, 'invalidate_submission', { participation_id: target.participationId, level });
    await logAudit({ action: `Re-evaluate person (${level})`, contestId: target.contestId, targets: [target.username], result: 'ok' });
  } catch (err) {
    await logAudit({
      action: `Re-evaluate person (${level})`,
      contestId: target.contestId,
      targets: [target.username],
      result: 'failed',
      details: String(err),
    });
    throw err;
  }
}

/** Re-evaluate one submission on its dataset. */
export async function reevaluateSubmission(
  client: AwsClient,
  target: { contestId: number; submissionId: number; datasetId: number },
  level: ReevaluationLevel,
): Promise<void> {
  const entry = { action: `Re-evaluate submission (${level})`, contestId: target.contestId, targets: [String(target.submissionId)] };
  try {
    await client.rpc('EvaluationService', 0, 'invalidate_submission', {
      submission_id: target.submissionId,
      dataset_id: target.datasetId,
      level,
    });
    await logAudit({ ...entry, result: 'ok' });
  } catch (err) {
    await logAudit({ ...entry, result: 'failed', details: String(err) });
    throw err;
  }
}

/**
 * Send a private message and check it arrived: AWS redirects back to the
 * participation page, which must now list the message.
 */
export async function sendPrivateMessage(
  client: AwsClient,
  target: { contestId: number; userId: number; username: string },
  subject: string,
  text: string,
): Promise<void> {
  const entry = { action: 'Private message', contestId: target.contestId, targets: [target.username], details: subject };
  try {
    const result = await client.postForm(`contest/${target.contestId}/user/${target.userId}/message`, {
      message_subject: subject,
      message_text: text,
    });
    const page = result.doc ? parseParticipationPage(result.doc) : null;
    const arrived = page?.messages.some((m) => m.subject === subject.trim() && m.text === text.trim());
    if (!arrived) throw new Error('AWS did not show the message after sending. Check the participation page.');
    await logAudit({ ...entry, result: 'ok' });
  } catch (err) {
    await logAudit({ ...entry, result: 'failed', details: `${subject}: ${String(err)}` });
    throw err;
  }
}

/** Submitted files never change, so their text is kept for the life of the tab. */
const sourceCache = new Map<string, Promise<string>>();

/** Source file text of a submission. */
export function fetchSource(client: AwsClient, fileId: number): Promise<string> {
  const path = `submission_file/${fileId}`;
  const key = client.url(path);
  let text = sourceCache.get(key);
  if (!text) {
    text = client.getText(path);
    sourceCache.set(key, text);
    text.catch(() => sourceCache.delete(key));
  }
  return text;
}

/** Larger files are offered as a download only. */
export const MAX_SOURCE_CHARS = 1_000_000;

/** True for text worth showing: not too large and without NUL or undecodable bytes. */
export function isViewableSource(text: string): boolean {
  return text.length <= MAX_SOURCE_CHARS && !/[\u0000�]/.test(text);
}
