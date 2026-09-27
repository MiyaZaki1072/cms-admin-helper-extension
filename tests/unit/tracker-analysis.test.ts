import { describe, expect, it } from 'vitest';
import type { Submission, SubmissionStatus, Task } from '@/core/model';
import {
  type Contestant,
  NO_FILTERS,
  applyFilters,
  buildGrid,
  flagsFor,
  improvedIds,
  searchContestants,
  summarizePerson,
} from '@/features/tracker/analysis';

const tasks: Task[] = [
  { id: 1, name: 'sum', title: 'A plus B' },
  { id: 2, name: 'max', title: 'Largest Number' },
];
const MIN = 60_000;
let nextId = 1;
function sub(userId: number, taskId: number, minute: number, status: SubmissionStatus, score: number | null = null): Submission {
  return {
    id: nextId++,
    timestamp: minute * MIN,
    contestId: 1,
    userId,
    username: `stu00${userId}`,
    taskId,
    taskName: taskId === 1 ? 'sum' : 'max',
    status,
    statusText: status,
    score: status === 'scored' ? score : null,
    maxScore: status === 'scored' ? 100 : null,
    official: true,
    token: false,
    comment: '',
    datasetId: 1,
    files: [],
  };
}

const roster: Contestant[] = [
  { userId: 1, username: 'stu001', firstName: 'Somchai', lastName: 'Jaidee', fullName: 'Somchai Jaidee', teamId: 1, teamCode: 'BKK01', teamName: 'Team BKK01' },
  { userId: 2, username: 'stu002', firstName: 'Malee', lastName: 'Srisuk', fullName: 'Malee Srisuk', teamId: 2, teamCode: 'CNX01', teamName: 'Team CNX01' },
  { userId: 7, username: 'stu007', firstName: 'Anan', lastName: 'Boonmee', fullName: 'Anan Boonmee', teamId: 1, teamCode: 'BKK01', teamName: 'Team BKK01' },
];

describe('summarizePerson', () => {
  it('best score, attempts, time of best, compile errors per task', () => {
    const subs = [
      sub(1, 1, 10, 'compilation_failed'),
      sub(1, 1, 12, 'scored', 60),
      sub(1, 1, 20, 'scored', 100),
      sub(1, 1, 25, 'scored', 100),
      sub(1, 2, 30, 'evaluating'),
    ];
    const s = summarizePerson(1, subs, tasks);
    expect(s.tasks).toEqual([
      { taskId: 1, taskName: 'sum', best: 100, maxScore: 100, attempts: 4, compileErrors: 1, timeOfBest: 20 * MIN, lastAt: 25 * MIN, pending: 0 },
      { taskId: 2, taskName: 'max', best: null, maxScore: null, attempts: 1, compileErrors: 0, timeOfBest: null, lastAt: 30 * MIN, pending: 1 },
    ]);
    expect(s).toMatchObject({ total: 100, submissions: 5, compileErrors: 1, firstActivity: 10 * MIN, lastActivity: 30 * MIN });
  });

  it('ignores unofficial submissions for the best score', () => {
    const unofficial = { ...sub(1, 1, 5, 'scored', 100), official: false };
    expect(summarizePerson(1, [unofficial, sub(1, 1, 6, 'scored', 40)], tasks).tasks[0]!.best).toBe(40);
  });

  it('lists every contest task even with no submissions', () => {
    expect(summarizePerson(9, [], tasks).tasks.map((t) => [t.taskName, t.attempts, t.best])).toEqual([
      ['sum', 0, null],
      ['max', 0, null],
    ]);
  });
});

describe('flags', () => {
  it('idle only while the contest runs', () => {
    const s = summarizePerson(1, [sub(1, 1, 0, 'scored', 100)], tasks);
    expect(flagsFor(s, 31 * MIN, true)).toContain('idle');
    expect(flagsFor(s, 29 * MIN, true)).not.toContain('idle');
    expect(flagsFor(s, 31 * MIN, false)).not.toContain('idle');
    expect(flagsFor(summarizePerson(1, [], tasks), 0, true)).toContain('idle');
  });
  it('many compile errors and stuck at zero', () => {
    const subs = [
      ...Array.from({ length: 5 }, (_, i) => sub(2, 1, i, 'compilation_failed')),
      ...Array.from({ length: 5 }, (_, i) => sub(2, 2, 10 + i, 'scored', 0)),
    ];
    expect(flagsFor(summarizePerson(2, subs, tasks), 15 * MIN, true).sort()).toEqual(['compile-errors', 'stuck-zero']);
  });
});

describe('grid', () => {
  it('one row per contestant, including those who never submitted', () => {
    const grid = buildGrid(roster, [sub(1, 1, 1, 'scored', 100), sub(7, 2, 2, 'scored', 40)], tasks, { now: 3 * MIN, contestRunning: true });
    expect(grid.map((r) => [r.contestant.username, r.total, r.submissions])).toEqual([
      ['stu001', 100, 1],
      ['stu002', 0, 0],
      ['stu007', 40, 1],
    ]);
    expect(grid[1]!.flags).toContain('idle');
  });
});

describe('filters', () => {
  const subs = [
    sub(1, 1, 1, 'scored', 30),
    sub(1, 1, 2, 'scored', 20),
    sub(1, 1, 3, 'scored', 80),
    sub(2, 2, 4, 'compilation_failed'),
    sub(7, 2, 5, 'scored', 100),
    sub(7, 2, 6, 'evaluating'),
  ];
  const ids = (list: Submission[]) => list.map((s) => s.id);

  it('no filters: everything, newest first', () => {
    expect(ids(applyFilters(subs, NO_FILTERS, roster))).toEqual(ids([...subs].reverse()));
  });
  it('by user, team, task, status', () => {
    expect(applyFilters(subs, { ...NO_FILTERS, userIds: [7] }, roster)).toHaveLength(2);
    expect(applyFilters(subs, { ...NO_FILTERS, teamCode: 'BKK01' }, roster)).toHaveLength(5);
    expect(applyFilters(subs, { ...NO_FILTERS, taskId: 2 }, roster)).toHaveLength(3);
    expect(applyFilters(subs, { ...NO_FILTERS, status: 'compilation_failed' }, roster).map((s) => s.userId)).toEqual([2]);
    expect(applyFilters(subs, { ...NO_FILTERS, status: 'pending' }, roster).map((s) => s.status)).toEqual(['evaluating']);
  });
  it('by score range and time window', () => {
    expect(applyFilters(subs, { ...NO_FILTERS, scoreMin: 50 }, roster).map((s) => s.score)).toEqual([100, 80]);
    expect(applyFilters(subs, { ...NO_FILTERS, scoreMax: 25 }, roster).map((s) => s.score)).toEqual([20]);
    expect(applyFilters(subs, { ...NO_FILTERS, from: 2 * MIN, to: 4 * MIN }, roster)).toHaveLength(3);
  });
  it('improved score only', () => {
    expect(improvedIds(subs)).toEqual(new Set([subs[0]!.id, subs[2]!.id, subs[4]!.id]));
    expect(applyFilters(subs, { ...NO_FILTERS, improvedOnly: true }, roster).map((s) => s.score)).toEqual([100, 80, 30]);
  });
});

describe('searchContestants', () => {
  it('matches username, name and team; exact and prefix first', () => {
    expect(searchContestants(roster, 'stu007').map((c) => c.username)).toEqual(['stu007']);
    expect(searchContestants(roster, 'mal').map((c) => c.username)).toEqual(['stu002']);
    expect(searchContestants(roster, 'bkk01').map((c) => c.username)).toEqual(['stu001', 'stu007']);
    expect(searchContestants(roster, '').map((c) => c.username)).toEqual(['stu001', 'stu002', 'stu007']);
    expect(searchContestants(roster, 'zzz')).toEqual([]);
  });
});
