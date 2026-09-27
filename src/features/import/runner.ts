/**
 * Runs an import plan: create missing teams, create users, add them to the
 * contest, then set team / IP / extra time on the participation. Two rows at
 * a time (the request queue caps the load); pause through the queue; cancel
 * with the signal. Every step is checked against what AWS shows afterwards.
 */
import type { ImportPlan, PlannedRow, RowStatus } from './plan';

/** Writes to CMS, one AWS form each. Implemented over AwsClient in writes.ts. */
export interface ImportApi {
  createTeam(code: string): Promise<void>;
  listTeams(): Promise<Set<string>>;
  /** Returns the new user id. */
  createUser(row: PlannedRow, method: 'bcrypt' | 'plaintext'): Promise<number>;
  addParticipation(userId: number, flags: { hidden: boolean; unrestricted: boolean }): Promise<void>;
  updateParticipation(userId: number, changes: { team?: string; ip?: string; extraTime?: number }): Promise<void>;
}

export type RowState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';

export interface RowOutcome {
  line: number;
  username: string;
  firstName: string;
  lastName: string;
  team: string;
  /** Password of a user this import created ("" otherwise). */
  password: string;
  planned: RowStatus;
  state: RowState;
  userId: number | null;
  message: string;
}

export interface RunOptions {
  method: 'bcrypt' | 'plaintext';
  concurrency?: number;
  signal?: AbortSignal;
  onRow?: (outcome: RowOutcome) => void;
  onPhase?: (text: string) => void;
}

/** Run `fn` over items with at most `concurrency` at once; stops starting new ones when aborted. */
export async function runPool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal?.aborted) {
      const item = items[next++]!;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function runImport(plan: ImportPlan, api: ImportApi, options: RunOptions): Promise<RowOutcome[]> {
  const { signal, onRow, onPhase } = options;
  const outcomes = new Map<number, RowOutcome>();
  const emit = (o: RowOutcome) => onRow?.({ ...o });

  for (const row of plan.rows) {
    const o: RowOutcome = {
      line: row.line,
      username: row.username,
      firstName: row.firstName,
      lastName: row.lastName,
      team: row.team,
      password: row.status === 'new' ? row.password : '',
      planned: row.status,
      state: row.status === 'error' ? 'failed' : row.status === 'skip' ? 'skipped' : 'waiting',
      userId: row.userId,
      message: row.status === 'error' ? row.errors.join('; ') : row.status === 'skip' ? 'Already in the contest' : '',
    };
    outcomes.set(row.line, o);
    emit(o);
  }

  // Teams first.
  const failedTeams = new Map<string, string>();
  if (plan.newTeams.length > 0) {
    onPhase?.(`Creating ${plan.newTeams.length} team(s)`);
    for (const code of plan.newTeams) {
      if (signal?.aborted) break;
      try {
        await api.createTeam(code);
      } catch (err) {
        failedTeams.set(code, errorText(err));
      }
    }
    const teams = await api.listTeams();
    for (const code of plan.newTeams) {
      if (!teams.has(code) && !failedTeams.has(code)) failedTeams.set(code, 'AWS did not create it');
    }
  }

  const work = plan.rows.filter((r) => r.status === 'new' || r.status === 'add');
  onPhase?.(`Importing ${work.length} user(s)`);
  await runPool(
    work,
    options.concurrency ?? 2,
    async (row) => {
      const o = outcomes.get(row.line)!;
      if (row.team && failedTeams.has(row.team)) {
        o.state = 'failed';
        o.message = `Team ${row.team} could not be created: ${failedTeams.get(row.team)}`;
        emit(o);
        return;
      }
      o.state = 'running';
      emit(o);
      const done: string[] = [];
      try {
        if (row.status === 'new') {
          o.userId = await api.createUser(row, options.method);
          done.push('user created');
        }
        await api.addParticipation(o.userId!, { hidden: row.hidden, unrestricted: row.unrestricted });
        done.push('added to contest');
        const changes: { team?: string; ip?: string; extraTime?: number } = {};
        if (row.team) changes.team = row.team;
        if (row.ip) changes.ip = row.ip;
        if (row.extraTime) changes.extraTime = row.extraTime;
        if (Object.keys(changes).length > 0) {
          await api.updateParticipation(o.userId!, changes);
          done.push(`${Object.keys(changes).map((k) => (k === 'extraTime' ? 'extra time' : k === 'ip' ? 'IP' : k)).join(', ')} set`);
        }
        o.state = 'done';
        o.message = done.join(', ');
      } catch (err) {
        o.state = 'failed';
        o.message = (done.length ? `${done.join(', ')}; then failed: ` : '') + errorText(err);
      }
      emit(o);
    },
    signal,
  );

  for (const o of outcomes.values()) {
    if (o.state === 'waiting') {
      o.state = 'cancelled';
      o.message = 'Not run (cancelled)';
      emit(o);
    }
  }
  return [...outcomes.values()].sort((a, b) => a.line - b.line);
}

export function summarize(outcomes: readonly RowOutcome[]): Record<RowState, number> {
  const counts: Record<RowState, number> = { waiting: 0, running: 0, done: 0, failed: 0, skipped: 0, cancelled: 0 };
  for (const o of outcomes) counts[o.state]++;
  return counts;
}
