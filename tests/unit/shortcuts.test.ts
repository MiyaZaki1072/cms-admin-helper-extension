import { describe, expect, it } from 'vitest';
import type { Submission } from '@/core/model';
import { parseContestForm } from '@/core/parsers';
import { pickSubmissions } from '@/features/shortcuts/actions';
import { parseSeatMap } from '@/features/shortcuts/bulk';
import { contestChecks } from '@/features/shortcuts/checklist';
import { unanswered } from '@/features/shortcuts/questions-watch';
import { fillPlaceholders, unknownPlaceholders } from '@/features/shortcuts/templates';
import { parseQuestions } from '@/core/parsers';
import { fixture } from './fixtures';

describe('placeholders', () => {
  const v = { username: 'stu007', firstName: 'Anan', lastName: 'Boonmee', teamCode: 'BKK01' };
  it('fills every known placeholder, repeatedly', () => {
    expect(fillPlaceholders('Hi {first_name} ({username}, {team}) {username}', v)).toBe('Hi Anan (stu007, BKK01) stu007');
  });
  it('reports unknown ones', () => {
    expect(unknownPlaceholders('Hi {firstname} {username} {Team}')).toEqual(['{firstname}', '{Team}']);
  });
});

describe('seat map', () => {
  it('reads username,ip with or without a header and checks IPs', () => {
    expect(parseSeatMap('username,ip\nstu001,10.0.0.1\nstu002,10.0.0.5/24\n,10.0.0.3\nstu004,')).toEqual([
      { line: 2, username: 'stu001', ip: '10.0.0.1', error: null },
      { line: 3, username: 'stu002', ip: '10.0.0.5/24', error: expect.stringMatching(/host bits/) },
      { line: 4, username: '', ip: '10.0.0.3', error: 'Username is empty' },
      { line: 5, username: 'stu004', ip: '', error: 'IP is empty' },
    ]);
    expect(parseSeatMap('stu001\t10.0.0.1')[0]).toMatchObject({ line: 1, username: 'stu001' });
  });
});

describe('pickSubmissions', () => {
  const s = (id: number, userId: number, taskId: number, t: number, score: number | null, official = true): Submission => ({
    id,
    timestamp: t,
    contestId: 1,
    userId,
    username: `u${userId}`,
    taskId,
    taskName: taskId === 1 ? 'sum' : 'max',
    status: score === null ? 'compilation_failed' : 'scored',
    statusText: '',
    score,
    maxScore: 100,
    official,
    token: false,
    comment: '',
    datasetId: 1,
    files: [],
  });
  const subs = [s(1, 1, 1, 10, 60), s(2, 1, 1, 20, 100), s(3, 1, 1, 30, 40), s(4, 1, 2, 5, null), s(5, 2, 1, 1, 100), s(6, 2, 1, 50, 100, false)];
  it('best per user and task (latest on ties), official only', () => {
    expect(pickSubmissions(subs, 'best', null).map((x) => x.id)).toEqual([4, 2, 5]);
  });
  it('last per user and task', () => {
    expect(pickSubmissions(subs, 'last', null).map((x) => x.id)).toEqual([4, 3, 5]);
  });
  it('one task only', () => {
    expect(pickSubmissions(subs, 'best', 2).map((x) => x.id)).toEqual([4]);
  });
});

describe('checklist', () => {
  const settings = parseContestForm(fixture('contest.html'));
  it('all good for a future contest', () => {
    const items = contestChecks({ settings, taskCount: 2, participantCount: 50, now: Date.UTC(2026, 0, 1) });
    expect(items.filter((i) => i.level !== 'ok')).toEqual([]);
  });
  it('flags missing timezone, tasks, contestants and a running contest', () => {
    const items = contestChecks({ settings: { ...settings, timezone: '' }, taskCount: 0, participantCount: 0, now: Date.UTC(2026, 8, 27, 8) });
    const texts = items.filter((i) => i.level !== 'ok').map((i) => i.text);
    expect(texts).toEqual([
      'The contest is already running.',
      'The contest timezone is empty: contestants see UTC times.',
      'The contest has no tasks.',
      'Nobody is in the contest yet.',
    ]);
  });
});

describe('questions inbox', () => {
  it('counts questions that are neither answered nor ignored', () => {
    expect(unanswered(parseQuestions(fixture('contest-questions.html'))).map((q) => q.username)).toEqual(['stu003', 'stu001']);
  });
});
