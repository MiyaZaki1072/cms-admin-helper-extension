/**
 * Bulk actions on existing users: add to another contest, remove from a
 * contest, reset passwords. Each run is one audit-log entry.
 */
import { logAudit } from '@/core/audit';
import { generatePassword } from './passwords';
import { runPool } from './runner';
import type { ContestWrites } from './writes';

export interface BulkTarget {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
}

export interface BulkOutcome extends BulkTarget {
  state: 'done' | 'failed' | 'skipped';
  message: string;
  /** New password (password reset only). */
  password: string;
}

interface Common {
  signal?: AbortSignal;
  onRow?: (o: BulkOutcome) => void;
}

async function run(
  action: string,
  contestId: number,
  users: readonly BulkTarget[],
  step: (u: BulkTarget, out: BulkOutcome) => Promise<void>,
  { signal, onRow }: Common,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];
  await runPool(
    users,
    2,
    async (u) => {
      const out: BulkOutcome = { ...u, state: 'done', message: '', password: '' };
      try {
        await step(u, out);
      } catch (err) {
        out.state = 'failed';
        out.message = err instanceof Error ? err.message : String(err);
      }
      outcomes.push(out);
      onRow?.(out);
    },
    signal,
  );
  const done = outcomes.filter((o) => o.state === 'done');
  const failed = outcomes.filter((o) => o.state === 'failed').length;
  await logAudit({
    action,
    contestId,
    targets: done.map((o) => o.username),
    result: failed === 0 ? (done.length || outcomes.length ? 'ok' : 'cancelled') : done.length ? 'partial' : 'failed',
    details: `${done.length} done, ${failed} failed, ${outcomes.length - done.length - failed} skipped${signal?.aborted ? ', cancelled' : ''}`,
  });
  return outcomes;
}

export async function bulkAddToContest(target: ContestWrites, targetContestId: number, users: readonly BulkTarget[], opts: Common = {}) {
  const already = await target.participantIds();
  return run(
    'Bulk add to contest',
    targetContestId,
    users,
    async (u, out) => {
      if (already.has(u.userId)) {
        out.state = 'skipped';
        out.message = 'Already in the contest';
        return;
      }
      await target.addParticipation(u.userId, { hidden: false, unrestricted: false });
      out.message = 'Added';
    },
    opts,
  );
}

export async function bulkRemoveFromContest(api: ContestWrites, contestId: number, users: readonly BulkTarget[], opts: Common = {}) {
  return run(
    'Bulk remove from contest',
    contestId,
    users,
    async (u, out) => {
      await api.removeParticipation(u.userId);
      out.message = 'Removed';
    },
    opts,
  );
}

export async function bulkResetPasswords(
  api: ContestWrites,
  contestId: number,
  users: readonly BulkTarget[],
  method: 'bcrypt' | 'plaintext',
  digits: number,
  opts: Common = {},
) {
  return run(
    `Bulk password reset (${method})`,
    contestId,
    users,
    async (u, out) => {
      const password = generatePassword(digits);
      await api.resetPassword(u.userId, password, method);
      out.password = password;
      out.message = 'Password changed';
    },
    opts,
  );
}
