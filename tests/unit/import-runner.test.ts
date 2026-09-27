import { describe, expect, it, vi } from 'vitest';
import { guessMapping } from '@/features/import/fields';
import { guessContestUrl } from '@/features/import/cards';
import { parseText } from '@/features/import/parse';
import { type ServerState, planImport } from '@/features/import/plan';
import { type ImportApi, type RowOutcome, runImport, runPool, summarize } from '@/features/import/runner';
import { validateRows } from '@/features/import/validate';
import { normalizeIps } from '@/features/import/writes';

const server: ServerState = {
  users: new Map([
    ['stu001', { id: 1, username: 'stu001', firstName: 'A', lastName: 'B' }],
    ['guest01', { id: 51, username: 'guest01', firstName: 'Guest', lastName: 'Account' }],
  ]),
  participantIds: new Set([1]),
  teamCodes: new Set(['BKK01']),
};

function planFor(csv: string) {
  const table = parseText(csv);
  return planImport(validateRows(table, guessMapping(table[0]!).mapping, true), server, { method: 'bcrypt', passwordDigits: 4 }, () => 'pw-0000');
}

/** In-memory CMS. */
function fakeApi(opts: { failUser?: string; failTeam?: string } = {}) {
  const teams = new Set(server.teamCodes);
  const participations = new Set<number>();
  const updates: Array<[number, object]> = [];
  let nextId = 100;
  const api: ImportApi = {
    createTeam: vi.fn(async (code: string) => {
      if (code !== opts.failTeam) teams.add(code);
    }),
    listTeams: vi.fn(async () => new Set(teams)),
    createUser: vi.fn(async (row) => {
      if (row.username === opts.failUser) throw new Error('Operation failed. duplicate key value');
      return nextId++;
    }),
    addParticipation: vi.fn(async (userId: number) => {
      participations.add(userId);
    }),
    updateParticipation: vi.fn(async (userId: number, changes: object) => {
      updates.push([userId, changes]);
    }),
  };
  return { api, teams, participations, updates };
}

describe('runImport', () => {
  const csv = `username,team,ip,extra_time
new001,BKK01,,
new002,NEWTEAM,10.0.0.12,10m
guest01,,,
stu001,,,
bad user,,,`;

  it('creates teams, users and participations, then sets the extra fields', async () => {
    const { api, teams, participations, updates } = fakeApi();
    const rows: RowOutcome[] = [];
    const out = await runImport(planFor(csv), api, { method: 'bcrypt', onRow: (o) => rows.push(o) });
    expect(teams.has('NEWTEAM')).toBe(true);
    expect(out.map((o) => [o.username, o.state])).toEqual([
      ['new001', 'done'],
      ['new002', 'done'],
      ['guest01', 'done'],
      ['stu001', 'skipped'],
      ['bad user', 'failed'],
    ]);
    expect(out[0]).toMatchObject({ userId: 100, password: 'pw-0000', message: 'user created, added to contest, team set' });
    expect(out[2]).toMatchObject({ userId: 51, password: '', message: 'added to contest' });
    expect([...participations].sort((a, b) => a - b)).toEqual([51, 100, 101]);
    expect(updates).toContainEqual([101, { team: 'NEWTEAM', ip: '10.0.0.12', extraTime: 600 }]);
    expect(summarize(out)).toMatchObject({ done: 3, skipped: 1, failed: 1 });
    expect(rows.some((r) => r.state === 'running')).toBe(true);
  });

  it('reports AWS errors per row and keeps going', async () => {
    const { api } = fakeApi({ failUser: 'new001' });
    const out = await runImport(planFor(csv), api, { method: 'bcrypt' });
    expect(out[0]).toMatchObject({ state: 'failed', message: 'Operation failed. duplicate key value' });
    expect(out[1]!.state).toBe('done');
  });

  it('fails the rows of a team that could not be created', async () => {
    const { api } = fakeApi({ failTeam: 'NEWTEAM' });
    const out = await runImport(planFor(csv), api, { method: 'bcrypt' });
    expect(out[1]).toMatchObject({ state: 'failed', message: 'Team NEWTEAM could not be created: AWS did not create it' });
    expect(api.createUser).not.toHaveBeenCalledWith(expect.objectContaining({ username: 'new002' }), 'bcrypt');
  });

  it('says what was done before a later step failed', async () => {
    const { api } = fakeApi();
    api.updateParticipation = vi.fn(async () => {
      throw new Error('AWS did not keep the participation change');
    });
    const out = await runImport(planFor(csv), api, { method: 'bcrypt' });
    expect(out[1]!.message).toBe('user created, added to contest; then failed: AWS did not keep the participation change');
    expect(out[1]!.userId).toBe(101);
  });

  it('cancel leaves the remaining rows not run', async () => {
    const { api } = fakeApi();
    const controller = new AbortController();
    api.createUser = vi.fn(async () => {
      controller.abort();
      return 500;
    });
    const out = await runImport(planFor(csv), api, { method: 'bcrypt', concurrency: 1, signal: controller.signal });
    expect(out.filter((o) => o.state === 'cancelled').map((o) => o.username)).toEqual(['new002', 'guest01']);
  });
});

describe('helpers', () => {
  it('runPool respects the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    await runPool([1, 2, 3, 4, 5], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(2);
  });
  it('normalizeIps ignores /32 and order', () => {
    expect(normalizeIps('10.0.0.12/32, 10.1.0.0/16')).toBe(normalizeIps('10.1.0.0/16,10.0.0.12'));
  });
  it('guesses the contest site from the AWS address', () => {
    expect(guessContestUrl('http://10.0.0.5:8889/', 'test')).toBe('http://10.0.0.5:8888/test');
    expect(guessContestUrl('https://aws.example.org/', 'ioi 2026')).toBe('https://aws.example.org/ioi%202026');
  });
});
