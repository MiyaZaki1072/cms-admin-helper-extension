/**
 * Pure functions over the submission index: per-person summaries, the
 * contest grid with flags, filters and export rows. No I/O.
 */
import type { Submission, Task } from '@/core/model';
import { PENDING } from './sync';

export interface Contestant {
  userId: number;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  teamId: number | null;
  teamCode: string;
  teamName: string;
}

export interface TaskSummary {
  taskId: number;
  taskName: string;
  /** Best score among official scored submissions; null if none scored yet. */
  best: number | null;
  maxScore: number | null;
  attempts: number;
  compileErrors: number;
  /** Time of the first submission that reached `best`. */
  timeOfBest: number | null;
  lastAt: number | null;
  pending: number;
}

export interface PersonSummary {
  userId: number;
  tasks: TaskSummary[];
  total: number;
  submissions: number;
  compileErrors: number;
  firstActivity: number | null;
  lastActivity: number | null;
}

export type Flag = 'idle' | 'compile-errors' | 'stuck-zero';

export const FLAG_LABEL: Record<Flag, string> = {
  idle: 'No submission in 30 min',
  'compile-errors': 'Many compile errors',
  'stuck-zero': 'Still 0 after 5 tries',
};

export const FLAG_RULES = {
  idleMinutes: 30,
  compileErrors: 5,
  stuckAttempts: 5,
} as const;

export interface GridRow extends PersonSummary {
  contestant: Contestant;
  flags: Flag[];
}

export type StatusFilter = 'any' | 'scored' | 'compilation_failed' | 'pending';

export interface Filters {
  userIds: number[];
  teamCode: string;
  taskId: number | null;
  status: StatusFilter;
  scoreMin: number | null;
  scoreMax: number | null;
  /** ms, inclusive. */
  from: number | null;
  to: number | null;
  improvedOnly: boolean;
}

export const NO_FILTERS: Filters = {
  userIds: [],
  teamCode: '',
  taskId: null,
  status: 'any',
  scoreMin: null,
  scoreMax: null,
  from: null,
  to: null,
  improvedOnly: false,
};

export function byUser(submissions: Iterable<Submission>): Map<number, Submission[]> {
  const map = new Map<number, Submission[]>();
  for (const s of submissions) {
    const list = map.get(s.userId);
    if (list) list.push(s);
    else map.set(s.userId, [s]);
  }
  return map;
}

const chronological = (a: Submission, b: Submission) => a.timestamp - b.timestamp || a.id - b.id;

export function summarizePerson(userId: number, submissions: readonly Submission[], tasks: readonly Task[]): PersonSummary {
  const sorted = [...submissions].sort(chronological);
  const taskIds = new Set([...tasks.map((t) => t.id), ...sorted.map((s) => s.taskId)]);
  const summaries: TaskSummary[] = [...taskIds].map((taskId) => {
    const own = sorted.filter((s) => s.taskId === taskId);
    let best: number | null = null;
    let timeOfBest: number | null = null;
    let maxScore: number | null = null;
    for (const s of own) {
      if (s.status !== 'scored' || !s.official || s.score === null) continue;
      maxScore = s.maxScore ?? maxScore;
      if (best === null || s.score > best) {
        best = s.score;
        timeOfBest = s.timestamp;
      }
    }
    return {
      taskId,
      taskName: tasks.find((t) => t.id === taskId)?.name ?? own[0]?.taskName ?? String(taskId),
      best,
      maxScore,
      attempts: own.length,
      compileErrors: own.filter((s) => s.status === 'compilation_failed').length,
      timeOfBest,
      lastAt: own.at(-1)?.timestamp ?? null,
      pending: own.filter((s) => PENDING.has(s.status)).length,
    };
  });
  const order = new Map(tasks.map((t, i) => [t.id, i]));
  summaries.sort((a, b) => (order.get(a.taskId) ?? 1e9) - (order.get(b.taskId) ?? 1e9) || a.taskId - b.taskId);
  return {
    userId,
    tasks: summaries,
    total: summaries.reduce((sum, t) => sum + (t.best ?? 0), 0),
    submissions: sorted.length,
    compileErrors: summaries.reduce((sum, t) => sum + t.compileErrors, 0),
    firstActivity: sorted[0]?.timestamp ?? null,
    lastActivity: sorted.at(-1)?.timestamp ?? null,
  };
}

export function flagsFor(summary: PersonSummary, now: number, contestRunning: boolean): Flag[] {
  const flags: Flag[] = [];
  if (contestRunning) {
    const since = summary.lastActivity ?? null;
    if (since === null || now - since > FLAG_RULES.idleMinutes * 60_000) flags.push('idle');
  }
  if (summary.compileErrors >= FLAG_RULES.compileErrors) flags.push('compile-errors');
  if (summary.tasks.some((t) => t.attempts >= FLAG_RULES.stuckAttempts && (t.best ?? 0) === 0)) flags.push('stuck-zero');
  return flags;
}

export function buildGrid(
  roster: readonly Contestant[],
  submissions: Iterable<Submission>,
  tasks: readonly Task[],
  options: { now: number; contestRunning: boolean },
): GridRow[] {
  const grouped = byUser(submissions);
  const known = new Map(roster.map((c) => [c.userId, c]));
  // Someone who submitted but is missing from the roster (e.g. roster not loaded yet).
  for (const [userId, list] of grouped) {
    if (!known.has(userId)) {
      const username = list[0]?.username ?? String(userId);
      known.set(userId, { userId, username, firstName: '', lastName: '', fullName: '', teamId: null, teamCode: '', teamName: '' });
    }
  }
  return [...known.values()].map((contestant) => {
    const summary = summarizePerson(contestant.userId, grouped.get(contestant.userId) ?? [], tasks);
    return { ...summary, contestant, flags: flagsFor(summary, options.now, options.contestRunning) };
  });
}

/** Ids of submissions that raised the user's best official score on their task. */
export function improvedIds(submissions: Iterable<Submission>): Set<number> {
  const best = new Map<string, number>();
  const out = new Set<number>();
  for (const s of [...submissions].sort(chronological)) {
    if (s.status !== 'scored' || !s.official || s.score === null) continue;
    const key = `${s.userId}:${s.taskId}`;
    if (s.score > (best.get(key) ?? 0)) {
      out.add(s.id);
      best.set(key, s.score);
    }
  }
  return out;
}

export function matchesStatus(s: Submission, status: StatusFilter): boolean {
  switch (status) {
    case 'any':
      return true;
    case 'pending':
      return PENDING.has(s.status);
    default:
      return s.status === status;
  }
}

/** Filtered submissions, newest first. */
export function applyFilters(submissions: Iterable<Submission>, filters: Filters, roster: readonly Contestant[]): Submission[] {
  const all = [...submissions];
  const users = filters.userIds.length > 0 ? new Set(filters.userIds) : null;
  const team = filters.teamCode ? new Set(roster.filter((c) => c.teamCode === filters.teamCode).map((c) => c.userId)) : null;
  const improved = filters.improvedOnly ? improvedIds(all) : null;
  return all
    .filter(
      (s) =>
        (!users || users.has(s.userId)) &&
        (!team || team.has(s.userId)) &&
        (filters.taskId === null || s.taskId === filters.taskId) &&
        matchesStatus(s, filters.status) &&
        (filters.scoreMin === null || (s.score !== null && s.score >= filters.scoreMin)) &&
        (filters.scoreMax === null || (s.score !== null && s.score <= filters.scoreMax)) &&
        (filters.from === null || s.timestamp >= filters.from) &&
        (filters.to === null || s.timestamp <= filters.to) &&
        (!improved || improved.has(s.id)),
    )
    .sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
}

/** Case-insensitive search over username, full name and team. Best matches first. */
export function searchContestants(roster: readonly Contestant[], query: string, limit = 20): Contestant[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...roster].sort((a, b) => a.username.localeCompare(b.username)).slice(0, limit);
  const score = (c: Contestant): number => {
    const u = c.username.toLowerCase();
    if (u === q) return 0;
    if (u.startsWith(q)) return 1;
    if (c.fullName.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (c.teamCode.toLowerCase() === q || c.teamName.toLowerCase().includes(q)) return 3;
    if (u.includes(q) || c.fullName.toLowerCase().includes(q)) return 4;
    return -1;
  };
  return roster
    .map((c) => [c, score(c)] as const)
    .filter(([, s]) => s >= 0)
    .sort((a, b) => a[1] - b[1] || a[0].username.localeCompare(b[0].username))
    .slice(0, limit)
    .map(([c]) => c);
}
