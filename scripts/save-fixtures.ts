/**
 * Save raw HTML of CMS v1.5 AdminWebServer pages into tests/fixtures/v1.5/,
 * for the parser tests. Needs the local dev server from docs/dev-server.md,
 * seeded and running.
 *
 *   pnpm fixtures [--base http://localhost:8889]
 *
 * Logs in through the /login form like a browser would, as `admin` and then
 * as the read-only `viewer`. Contest, user and submission ids are discovered
 * from the pages, so the script works on any fresh seed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const baseArg = args.indexOf('--base');
const BASE = ((baseArg >= 0 ? args[baseArg + 1] : undefined) ?? 'http://localhost:8889').replace(/\/$/, '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'v1.5');

/** Minimal cookie jar + fetch that follows redirects by hand, keeping cookies. */
class Session {
  private cookies = new Map<string, string>();

  private store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  async request(path: string, init: RequestInit = {}): Promise<{ url: string; status: number; body: string }> {
    let url = new URL(path, BASE).href;
    let method = init.method ?? 'GET';
    let body = init.body;
    for (let hop = 0; hop < 10; hop++) {
      const headers = new Headers(init.headers);
      headers.set('Cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await fetch(url, { ...init, method, body, headers, redirect: 'manual' });
      this.store(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).href;
        method = 'GET';
        body = undefined;
        continue;
      }
      return { url, status: res.status, body: await res.text() };
    }
    throw new Error(`Too many redirects for ${path}`);
  }

  async get(path: string): Promise<string> {
    const res = await this.request(path);
    if (res.status !== 200) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    return res.body;
  }

  async login(username: string, password: string): Promise<void> {
    const page = await this.get('/login');
    const xsrf = /name="_xsrf" value="([^"]+)"/.exec(page)?.[1];
    if (!xsrf) throw new Error('No _xsrf field on /login');
    const res = await this.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password, _xsrf: xsrf, next: '/' }).toString(),
    });
    if (res.url.includes('login_error')) throw new Error(`Login failed for ${username}`);
  }

  async rpc(service: string, method: string, argsJson: object): Promise<string> {
    const xsrf = this.cookie('_xsrf');
    if (!xsrf) throw new Error('No _xsrf cookie');
    const res = await this.request(`/rpc/${service}/0/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRFToken': xsrf },
      body: JSON.stringify(argsJson),
    });
    if (res.status !== 200) throw new Error(`RPC ${service}.${method} -> HTTP ${res.status}`);
    return res.body;
  }
}

function first(re: RegExp, html: string, what: string): string {
  const m = re.exec(html);
  if (!m?.[1]) throw new Error(`Could not find ${what}`);
  return m[1];
}

/** User id of `username` from a contest users page. */
function userId(usersHtml: string, contestId: string, username: string): string {
  const re = new RegExp(`/contest/${contestId}/user/(\\d+)/edit"[^>]*>\\s*${username}\\s*<`);
  return first(re, usersHtml, `user ${username}`);
}

const saved: Array<{ file: string; page: string; note: string }> = [];

async function save(file: string, page: string, note: string, content: string): Promise<void> {
  await writeFile(join(OUT, file), content);
  saved.push({ file, page, note });
  console.log(`  ${file.padEnd(34)} ${page}`);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const anon = new Session();
  await save('login.html', '/login', 'Login form, not logged in', await anon.get('/login'));

  const s = new Session();
  await s.login('admin', 'admin');
  console.log(`Logged in to ${BASE} as admin`);

  const contests = await s.get('/contests');
  const c = first(/href="[^"]*\/contest\/(\d+)"/, contests, 'a contest link');
  const users = await s.get(`/contest/${c}/users`);
  const u1 = userId(users, c, 'stu001');
  const u49 = userId(users, c, 'stu049');
  const u50 = userId(users, c, 'stu050');
  const subs0 = await s.get(`/contest/${c}/submissions?page=0`);
  const scored = first(/href="[^"]*\/submission\/(\d+)"[\s\S]*?Scored \(/, subs0, 'a scored submission');
  const failed = /href="[^"]*\/submission\/(\d+)"[^<]*<\/a><\/td>(?:(?!<tr>)[\s\S])*?Compilation failed/.exec(subs0)?.[1];
  const task = first(/href="[^"]*\/task\/(\d+)"/, subs0, 'a task link');
  const team = first(/href="[^"]*\/team\/(\d+)"/, await s.get('/teams'), 'a team link');

  const status = JSON.parse(await s.rpc('AdminWebServer', 'submissions_status', { contest_id: Number(c) }));
  const pending = status.data
    ? Object.entries(status.data).filter(([k]) => !['scored', 'compilation_fail', 'total'].includes(k))
    : [];
  if (pending.some(([, n]) => Number(n) > 0)) {
    console.warn(`  (warning: some submissions are not final yet: ${JSON.stringify(status.data)})`);
  }

  console.log(`Contest ${c}; users stu001=${u1} stu049=${u49} stu050=${u50}; submission ${scored}; task ${task}`);

  await save('overview.html', '/', 'Home page (full admin)', await s.get('/'));
  await save('contests.html', '/contests', 'Contest list', contests);
  await save('contest.html', `/contest/${c}`, 'Contest settings form', await s.get(`/contest/${c}`));
  await save('contest-users.html', `/contest/${c}/users`, 'Users in the contest, plus "add user" select', users);
  await save('contest-submissions-p0.html', `/contest/${c}/submissions?page=0`, 'Submissions, newest first, page 1', subs0);
  await save('contest-submissions-p1.html', `/contest/${c}/submissions?page=1`, 'Submissions page 2', await s.get(`/contest/${c}/submissions?page=1`));
  await save('contest-tasks.html', `/contest/${c}/tasks`, 'Tasks in the contest', await s.get(`/contest/${c}/tasks`));
  await save('contest-ranking.html', `/contest/${c}/ranking`, 'Ranking table', await s.get(`/contest/${c}/ranking`));
  await save('contest-ranking.csv', `/contest/${c}/ranking/csv`, 'Ranking CSV export', await s.get(`/contest/${c}/ranking/csv`));
  await save('contest-questions.html', `/contest/${c}/questions`, 'Questions (one answered, one with HTML in it)', await s.get(`/contest/${c}/questions`));
  await save('contest-announcements.html', `/contest/${c}/announcements`, 'Announcements', await s.get(`/contest/${c}/announcements`));
  await save('participation-stu001.html', `/contest/${c}/user/${u1}/edit`, 'Participation with defaults; has a question and a message', await s.get(`/contest/${c}/user/${u1}/edit`));
  await save('participation-stu049.html', `/contest/${c}/user/${u49}/edit`, 'Participation with a plaintext contest password, no submissions', await s.get(`/contest/${c}/user/${u49}/edit`));
  await save('participation-stu050.html', `/contest/${c}/user/${u50}/edit`, 'Participation with every field set (bcrypt password, IPs, times, hidden, unrestricted)', await s.get(`/contest/${c}/user/${u50}/edit`));
  await save('submission-scored.html', `/submission/${scored}`, 'A scored submission', await s.get(`/submission/${scored}`));
  if (failed) {
    await save('submission-compile-failed.html', `/submission/${failed}`, 'A submission that failed to compile', await s.get(`/submission/${failed}`));
  }
  await save('task.html', `/task/${task}`, 'Task page', await s.get(`/task/${task}`));
  await save('users.html', '/users', 'All users', await s.get('/users'));
  await save('user.html', `/user/${u1}`, 'User page (stu001)', await s.get(`/user/${u1}`));
  await save('users-add.html', '/users/add', 'Create user form', await s.get('/users/add'));
  await save('teams.html', '/teams', 'Team list', await s.get('/teams'));
  await save('team.html', `/team/${team}`, 'Team page', await s.get(`/team/${team}`));
  await save('teams-add.html', '/teams/add', 'Create team form', await s.get('/teams/add'));
  await save('admins.html', '/admins', 'Admin list with permissions', await s.get('/admins'));
  await save('rpc-submissions-status.json', '/rpc/AdminWebServer/0/submissions_status', 'RPC reply', JSON.stringify(status, null, 2));
  await save('rpc-queue-status.json', '/rpc/EvaluationService/0/queue_status', 'RPC reply', await s.rpc('EvaluationService', 'queue_status', {}));
  await save('rpc-workers-status.json', '/rpc/EvaluationService/0/workers_status', 'RPC reply', await s.rpc('EvaluationService', 'workers_status', {}));
  // Last: reading /notifications empties the server's queue.
  await save('notifications.json', '/notifications', 'Notifications (JSON, not HTML)', await s.get('/notifications'));

  const ro = new Session();
  await ro.login('viewer', 'viewer');
  console.log('Logged in as viewer (read-only)');
  await save('readonly-overview.html', '/', 'Home page as a read-only admin', await ro.get('/'));
  await save('readonly-contest-users.html', `/contest/${c}/users`, 'Contest users as a read-only admin', await ro.get(`/contest/${c}/users`));
  await save('readonly-participation-stu001.html', `/contest/${c}/user/${u1}/edit`, 'Participation page as a read-only admin', await ro.get(`/contest/${c}/user/${u1}/edit`));
  await save('readonly-admins.html', '/admins', 'Admin list as a read-only admin', await ro.get('/admins'));

  const rows = saved.map((f) => `| \`${f.file}\` | \`${f.page}\` | ${f.note} |`).join('\n');
  await writeFile(
    join(OUT, 'README.md'),
    `# CMS v1.5 AWS fixtures

Raw pages from a local CMS v1.5 AdminWebServer seeded with \`scripts/seed.sh\`
(see \`docs/dev-server.md\`). Regenerate with \`pnpm fixtures\`.

Logged in as \`admin\` (full access) unless the file name starts with \`readonly-\`
(logged in as \`viewer\`, no permissions). Times on the pages are UTC.

| File | Page | What it shows |
| --- | --- | --- |
${rows}
`,
  );
  console.log(`Saved ${saved.length} fixtures to ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
