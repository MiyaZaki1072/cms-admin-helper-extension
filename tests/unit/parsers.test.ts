import { describe, expect, it } from 'vitest';
import {
  changedFields,
  detectPermission,
  detectVersion,
  formatCmsDateTime,
  getField,
  hasCreateLinks,
  parseAnnouncements,
  parseCmsDateTime,
  parseContestForm,
  parseContestTasks,
  parseContestTimes,
  parseContestUsers,
  parseContests,
  parseCurrentAdminName,
  parseCurrentContest,
  parseParticipationPage,
  parseQuestions,
  parseRanking,
  parseSubmissionPage,
  parseSubmissionsTable,
  parseTeams,
  parseUserPage,
  parseUsers,
  ParseError,
  setCheckbox,
  setField,
} from '@/core/parsers';
import { fixture, fixtureText } from './fixtures';

const utc = (s: string) => parseCmsDateTime(s);

describe('CMS date-times', () => {
  it('parses with and without microseconds, as UTC', () => {
    expect(parseCmsDateTime('2026-09-27 08:15:40')).toBe(Date.UTC(2026, 8, 27, 8, 15, 40));
    expect(parseCmsDateTime('2026-09-27 07:19:51.248675')).toBe(Date.UTC(2026, 8, 27, 7, 19, 51, 248));
    expect(() => parseCmsDateTime('27/09/2026')).toThrow();
  });
  it('formats back to the AWS form format', () => {
    expect(formatCmsDateTime(Date.UTC(2026, 9, 3, 23, 0, 0))).toBe('2026-10-03 23:00:00');
  });
});

describe('submissions table', () => {
  const page0 = parseSubmissionsTable(fixture('contest-submissions-p0.html'));
  const page1 = parseSubmissionsTable(fixture('contest-submissions-p1.html'));

  it('reads 50 rows per page, the total and the page count', () => {
    expect(page0.submissions).toHaveLength(50);
    expect(page1.submissions).toHaveLength(50);
    expect(page0.total).toBe(300);
    expect(page0.pages).toBe(6);
    expect(page1.pages).toBe(6);
  });

  it('parses a scored row completely', () => {
    expect(page0.submissions[0]).toEqual({
      id: 300,
      timestamp: utc('2026-09-27 08:15:40'),
      contestId: 1,
      userId: 15,
      username: 'stu015',
      taskId: 2,
      taskName: 'max',
      status: 'scored',
      statusText: 'Scored (100.0 / 100.0)',
      score: 100,
      maxScore: 100,
      official: true,
      token: false,
      comment: '',
      datasetId: 2,
      files: [{ name: 'max.py', fileId: 300 }],
    });
  });

  it('parses a compilation failure', () => {
    const failed = page0.submissions.find((s) => s.id === 297);
    expect(failed).toMatchObject({ status: 'compilation_failed', score: null, maxScore: null, username: 'stu039' });
  });

  it('is newest first, and page 1 continues page 0', () => {
    const ids = [...page0.submissions, ...page1.submissions].map((s) => s.id);
    expect(new Set(ids).size).toBe(100);
    const times = [...page0.submissions, ...page1.submissions].map((s) => s.timestamp);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('covers every score the seed data produces', () => {
    const scores = new Set([...page0.submissions, ...page1.submissions].map((s) => s.score));
    for (const score of [0, 40, 60, 80, 100]) expect(scores).toContain(score);
  });

  it('fails loudly when the table layout changes', () => {
    const doc = fixture('contest-submissions-p0.html');
    doc.querySelector('#submissions table.bordered thead th')!.textContent = 'When';
    expect(() => parseSubmissionsTable(doc)).toThrow(ParseError);
  });
});

describe('participation page', () => {
  it('reads every field of a fully set participation (stu050)', () => {
    const p = parseParticipationPage(fixture('participation-stu050.html'));
    expect(p).toMatchObject({ participationId: 50, contestId: 1, userId: 50, username: 'stu050', submissionCount: 0, submissions: [] });
    expect(p.form).toEqual({
      team: 'HDY01',
      password: '',
      method: 'bcrypt',
      hidden: true,
      unrestricted: true,
      ip: '10.0.0.50/32, 192.168.1.0/24',
      startingTime: '2026-09-27 07:19:51.248675',
      delayTime: 300,
      extraTime: 600,
    });
    expect(p.teamCodes).toEqual(['BKK01', 'BKK02', 'CNX01', 'KKN01', 'HDY01']);
  });

  it('serializes the form in page order, ready to POST back', () => {
    const p = parseParticipationPage(fixture('participation-stu050.html'));
    expect(p.fields.map(([k]) => k)).toEqual([
      '_xsrf',
      'team',
      'password',
      'method',
      'hidden',
      'unrestricted',
      'ip',
      'starting_time',
      'delay_time',
      'extra_time',
    ]);
    expect(getField(p.fields, 'hidden')).toBe('on');
  });

  it('reads a plaintext contest password and defaults (stu049)', () => {
    const p = parseParticipationPage(fixture('participation-stu049.html'));
    expect(p.form).toMatchObject({ password: 'plain-049', method: 'plaintext', hidden: false, team: 'KKN01', extraTime: 0 });
    expect(p.fields.some(([k]) => k === 'hidden')).toBe(false);
  });

  it('reads submissions, questions and messages (stu001)', () => {
    const p = parseParticipationPage(fixture('participation-stu001.html'));
    expect(p.submissions.length).toBe(p.submissionCount);
    expect(p.submissions.every((s) => s.userId === 1)).toBe(true);
    expect(p.questions).toEqual([
      expect.objectContaining({ id: 1, subject: 'Task sum: input size', text: 'Can A and B be negative?', answered: false }),
    ]);
    expect(p.messages).toEqual([
      { timestamp: expect.any(Number), subject: 'Your seat', text: 'Please move to seat 12.', author: 'admin' },
    ]);
  });

  it('fails when a form field is missing', () => {
    const doc = fixture('participation-stu001.html');
    doc.querySelector('#participation_info [name="extra_time"]')!.remove();
    expect(() => parseParticipationPage(doc)).toThrow(/extra_time/);
  });
});

describe('form helpers', () => {
  const fields: Array<[string, string]> = [
    ['_xsrf', 't'],
    ['team', 'A'],
    ['hidden', 'on'],
    ['extra_time', '0'],
  ];
  it('changes one field and keeps the rest', () => {
    const next = setField(fields, 'extra_time', '600');
    expect(next).toEqual([
      ['_xsrf', 't'],
      ['team', 'A'],
      ['hidden', 'on'],
      ['extra_time', '600'],
    ]);
    expect(changedFields(fields, next)).toEqual(['extra_time']);
  });
  it('ticks and unticks checkboxes', () => {
    expect(setCheckbox(fields, 'hidden', false).some(([k]) => k === 'hidden')).toBe(false);
    expect(setCheckbox(fields, 'unrestricted', true).at(-1)).toEqual(['unrestricted', 'on']);
    expect(setCheckbox(fields, 'hidden', true)).toEqual(fields);
  });
});

describe('lists', () => {
  it('contest users and the users not yet in the contest', () => {
    const { participants, unassigned } = parseContestUsers(fixture('contest-users.html'));
    expect(participants).toHaveLength(50);
    expect(participants[0]).toEqual({ id: 1, username: 'stu001', firstName: 'Arthit', lastName: 'Srisuk' });
    expect(unassigned).toEqual([{ id: 51, username: 'guest01' }]);
  });

  it('all users', () => {
    const users = parseUsers(fixture('users.html'));
    expect(users).toHaveLength(51);
    expect(users.find((u) => u.username === 'guest01')).toEqual({ id: 51, username: 'guest01', firstName: 'Guest', lastName: 'Account' });
  });

  it('teams, tasks, contests', () => {
    expect(parseTeams(fixture('teams.html'))).toContainEqual({ id: 5, code: 'HDY01', name: 'Team HDY01' });
    expect(parseTeams(fixture('teams.html'))).toHaveLength(5);
    expect(parseContestTasks(fixture('contest-tasks.html'))).toEqual([
      { id: 1, name: 'sum', title: 'A plus B' },
      { id: 2, name: 'max', title: 'Largest Number' },
    ]);
    expect(parseContests(fixture('contests.html'))).toEqual([{ id: 1, name: 'test', description: 'Test Contest' }]);
  });

  it('ranking with teams and per-task scores', () => {
    const ranking = parseRanking(fixture('contest-ranking.html'));
    expect(ranking.tasks).toEqual([
      { id: 1, name: 'sum' },
      { id: 2, name: 'max' },
    ]);
    // stu050 is a hidden participation: AWS leaves it out of the ranking.
    expect(ranking.rows).toHaveLength(49);
    expect(ranking.rows.some((r) => r.username === 'stu050')).toBe(false);
    expect(ranking.rows[0]).toEqual({
      userId: 18,
      username: 'stu018',
      fullName: 'Suda Wongsa',
      teamId: 3,
      teamName: 'Team CNX01',
      scores: { 1: 100, 2: 100 },
      total: 200,
    });
  });

  it('ranking CSV agrees with the ranking page', () => {
    const csvFirst = fixtureText('contest-ranking.csv').split(/\r?\n/)[1];
    expect(csvFirst).toBe('stu018,Suda Wongsa,Team CNX01,100.0,,100.0,,200.0,');
  });
});

describe('contest page', () => {
  const doc = fixture('contest.html');
  it('reads the settings form', () => {
    expect(parseContestForm(doc)).toMatchObject({
      name: 'test',
      description: 'Test Contest',
      start: '2026-09-27 06:16:37',
      stop: '2026-09-27 11:16:37',
      timezone: 'Asia/Bangkok',
      perUserTime: '',
      analysisEnabled: false,
      analysisStart: '2030-01-01 00:00:00',
    });
    expect(getField(parseContestForm(doc).fields, 'languages')).toBe('C++17 / g++');
  });
  it('reads contest times from the AWSUtils call', () => {
    const times = parseContestTimes(doc)!;
    expect(times.start * 1000).toBe(utc('2026-09-27 06:16:37'));
    expect(times.stop * 1000).toBe(utc('2026-09-27 11:16:37'));
    expect(times.phase).toBe(0);
    expect(times.serverNow).toBeGreaterThan(times.start);
  });
  it('knows the current contest from the sidebar', () => {
    expect(parseCurrentContest(doc)).toEqual({ id: 1, name: 'test' });
    expect(parseCurrentContest(fixture('overview.html'))).toBeNull();
  });
});

describe('questions and announcements', () => {
  it('questions, including HTML in the text as plain text', () => {
    const questions = parseQuestions(fixture('contest-questions.html'));
    expect(questions).toHaveLength(3);
    expect(questions[0]).toMatchObject({
      id: 3,
      username: 'stu003',
      userId: 3,
      subject: '<b>Tag</b> & "quotes"',
      text: 'Checks that the helper escapes <script>x</script>.',
      answered: false,
    });
    expect(questions.find((q) => q.username === 'stu002')).toMatchObject({
      answered: true,
      replySubject: 'Answered in task description',
      replyText: 'Either is fine.',
    });
  });
  it('announcements', () => {
    expect(parseAnnouncements(fixture('contest-announcements.html'))).toEqual([
      { id: 1, timestamp: expect.any(Number), subject: 'Task B clarification', text: 'N is at most 100.', author: 'admin' },
    ]);
  });
});

describe('submission page', () => {
  it('scored: testcases and compilation output', () => {
    const s = parseSubmissionPage(fixture('submission-scored.html'));
    expect(s).toMatchObject({
      id: 300,
      taskId: 2,
      taskName: 'max',
      userId: 15,
      username: 'stu015',
      language: 'Python 3 / CPython',
      status: 'scored',
      score: 100,
      maxScore: 100,
      official: true,
      files: [{ name: 'max.py', fileId: 300 }],
      compilationOutcome: 'Compilation succeeded',
    });
    expect(s.testcases).toHaveLength(5);
    expect(s.testcases[0]).toEqual({
      index: 1,
      codename: '000',
      outcome: '1.0',
      details: 'Output is correct',
      resources: '(0.067 s) (0.076 s) (3 MiB)',
      verdict: 'correct',
    });
  });
  it('compilation failed', () => {
    const s = parseSubmissionPage(fixture('submission-compile-failed.html'));
    expect(s).toMatchObject({ id: 297, status: 'compilation_failed', testcases: [], compilationOutcome: 'Compilation failed' });
  });
});

describe('user page', () => {
  it('reads the user form and participations', () => {
    const u = parseUserPage(fixture('user.html'));
    expect(u).toMatchObject({
      userId: 1,
      username: 'stu001',
      firstName: 'Arthit',
      lastName: 'Srisuk',
      password: 'pass001',
      method: 'plaintext',
      participations: [{ contestId: 1, hidden: false, unrestricted: false }],
    });
    expect(u.fields.map(([k]) => k)).toEqual([
      '_xsrf', 'first_name', 'last_name', 'username', 'password', 'method', 'email', 'timezone', 'preferred_languages',
    ]);
  });
});

describe('admin permission level', () => {
  it('full admin', () => {
    expect(detectPermission(fixture('admins.html'))).toBe('all');
    expect(parseCurrentAdminName(fixture('admins.html'))).toBe('admin');
    expect(hasCreateLinks(fixture('overview.html'))).toBe(true);
  });
  it('read-only admin', () => {
    expect(detectPermission(fixture('readonly-admins.html'))).toBe('readonly');
    expect(parseCurrentAdminName(fixture('readonly-overview.html'))).toBe('Read-only viewer');
    expect(hasCreateLinks(fixture('readonly-overview.html'))).toBe(false);
  });
  it('messaging-only admin', () => {
    const doc = fixture('readonly-admins.html');
    const selfRow = [...doc.querySelectorAll('#core tbody tr')].find((r) => r.querySelector('a'))!;
    selfRow.querySelectorAll('td')[4]!.textContent = 'True';
    expect(detectPermission(doc)).toBe('messaging');
  });
});

describe('version guard', () => {
  const pages = [
    'overview.html', 'contests.html', 'contest.html', 'contest-users.html', 'contest-submissions-p0.html',
    'participation-stu001.html', 'submission-scored.html', 'users.html', 'teams.html', 'contest-questions.html',
    'contest-announcements.html', 'admins.html', 'readonly-overview.html', 'login.html',
  ];
  it.each(pages)('%s looks like CMS v1.5', (name) => {
    expect(detectVersion(fixture(name))).toEqual({ ok: true, failures: [] });
  });
  it('reports what is missing on another page', () => {
    const doc = new DOMParser().parseFromString('<html><body><div id="core"></div></body></html>', 'text/html');
    const check = detectVersion(doc);
    expect(check.ok).toBe(false);
    expect(check.failures).toContain('#sidebar not found');
    expect(check.failures).toContain('CMS.AWSUtils(...) call not found');
  });
});
