import { describe, expect, it, vi } from 'vitest';
import { AwsClient, HttpError, NotLoggedInError, RpcError } from '@/core/aws-client';
import { RequestQueue } from '@/core/queue';

const BASE = 'http://aws.test:8889/';

/** Build a fake Response the way fetch returns it after following redirects. */
function reply(body: string, init: { url?: string; status?: number; type?: string; redirected?: boolean; date?: string } = {}) {
  const res = new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.type ?? 'text/html; charset=UTF-8', ...(init.date ? { date: init.date } : {}) },
  });
  Object.defineProperty(res, 'url', { value: init.url ?? BASE });
  Object.defineProperty(res, 'redirected', { value: init.redirected ?? false });
  return res;
}

function client(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, queue?: RequestQueue) {
  const fetchMock = vi.fn(fetchImpl);
  const c = new AwsClient({
    baseUrl: BASE,
    fetch: fetchMock as unknown as typeof fetch,
    cookies: () => 'other=1; _xsrf=2|abc|def|123',
    queue: queue ?? new RequestQueue({ baseDelayMs: 1 }),
  });
  return { c, fetchMock };
}

describe('AwsClient', () => {
  it('builds URLs relative to the base', () => {
    const { c } = client(async () => reply(''));
    expect(c.url('/contest/1/users')).toBe('http://aws.test:8889/contest/1/users');
    expect(c.url('contests')).toBe('http://aws.test:8889/contests');
    expect(c.pathOf('http://aws.test:8889/user/12?x=1')).toBe('user/12');
  });

  it('keeps an AWS path prefix', () => {
    const c = new AwsClient({ baseUrl: 'https://h/aws', fetch: vi.fn(), cookies: () => '' });
    expect(c.url('/contests')).toBe('https://h/aws/contests');
    expect(c.pathOf('https://h/aws/contest/3')).toBe('contest/3');
  });

  it('getPage parses HTML and sends cookies', async () => {
    const { c, fetchMock } = client(async (url) => reply('<ul><li class="x">Test</li></ul>', { url }));
    const { doc } = await c.getPage('contests');
    expect(doc.querySelector('li.x')?.textContent).toBe('Test');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'follow' });
  });

  it('throws NotLoggedInError when redirected to /login', async () => {
    const { c } = client(async () => reply('<form></form>', { url: `${BASE}login?next=%2Fcontests`, redirected: true }));
    await expect(c.getPage('contests')).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it('throws HttpError on 403 and 404 without retrying', async () => {
    const { c, fetchMock } = client(async (url) => reply('no', { url, status: 403 }));
    await expect(c.getPage('users/add')).rejects.toSatisfy(
      (e) => e instanceof HttpError && e.status === 403 && /permission/.test(e.message),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a GET on 5xx and succeeds', async () => {
    let n = 0;
    const { c, fetchMock } = client(async (url) => (++n < 3 ? reply('err', { url, status: 502 }) : reply('<p>ok</p>', { url })));
    const { doc } = await c.getPage('contests');
    expect(doc.querySelector('p')?.textContent).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('postForm adds _xsrf, url-encodes, and reports the redirect target', async () => {
    const { c, fetchMock } = client(async () => reply('<h1>User</h1>', { url: `${BASE}user/57`, redirected: true }));
    const result = await c.postForm('users/add', {
      username: 'stu101',
      first_name: 'Somchai',
      hidden: true,
      unrestricted: false,
      email: null,
    });
    expect(result).toMatchObject({ path: 'user/57', redirected: true, status: 200 });
    expect(result.doc?.querySelector('h1')?.textContent).toBe('User');
    const init = fetchMock.mock.calls[0]![1];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toBe('_xsrf=2%7Cabc%7Cdef%7C123&username=stu101&first_name=Somchai&hidden=on');
  });

  it('postForm can send multipart with repeated fields, in order', async () => {
    const { c, fetchMock } = client(async () => reply('', { url: `${BASE}contest/1/user/5/edit` }));
    await c.postForm(
      'contest/1/user/5/edit',
      [
        ['team', ''],
        ['password', ''],
        ['_xsrf', 'stale-token-from-page'],
      ],
      { multipart: true },
    );
    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect([...body.entries()]).toEqual([
      ['_xsrf', '2|abc|def|123'],
      ['team', ''],
      ['password', ''],
    ]);
  });

  it('never retries a POST, even on 5xx', async () => {
    const { c, fetchMock } = client(async (url) => reply('err', { url, status: 500 }));
    await expect(c.postForm('users/add', { username: 'x' })).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to POST without an _xsrf cookie', async () => {
    const c = new AwsClient({ baseUrl: BASE, fetch: vi.fn(), cookies: () => 'a=b' });
    await expect(c.postForm('users/add', {})).rejects.toBeInstanceOf(NotLoggedInError);
  });

  it('readNotifications keeps only plain notifications', async () => {
    const { c, fetchMock } = client(async (url) =>
      reply(
        JSON.stringify([
          { type: 'new_question', timestamp: 1, subject: 'q', text: 't', contest_id: 1 },
          { type: 'notification', timestamp: 2, subject: 'Operation failed.', text: 'duplicate key' },
        ]),
        { url, type: 'application/json' },
      ),
    );
    expect(await c.readNotifications()).toEqual([
      { type: 'notification', timestamp: 2, subject: 'Operation failed.', text: 'duplicate key' },
    ]);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/notifications\?last_notification=\d+$/);
  });

  it('rpc posts JSON with X-XSRFToken and unwraps data', async () => {
    const { c, fetchMock } = client(async (url) =>
      reply(JSON.stringify({ data: { scored: 3 }, error: null }), { url, type: 'application/json' }),
    );
    await expect(c.rpc('AdminWebServer', 0, 'submissions_status', { contest_id: 1 })).resolves.toEqual({ scored: 3 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}rpc/AdminWebServer/0/submissions_status`);
    expect(new Headers(init.headers).get('X-XSRFToken')).toBe('2|abc|def|123');
    expect(init.body).toBe('{"contest_id":1}');
  });

  it('rpc throws RpcError when the service reports an error', async () => {
    const { c } = client(async (url) =>
      reply(JSON.stringify({ data: null, error: 'Service not connected.' }), { url, type: 'application/json' }),
    );
    await expect(c.rpc('EvaluationService', 0, 'queue_status', {})).rejects.toBeInstanceOf(RpcError);
  });

  it('records the server clock offset from the Date header', async () => {
    const serverTime = new Date(Date.now() + 90_000).toUTCString();
    const { c } = client(async (url) => reply('<p></p>', { url, date: serverTime }));
    await c.getPage('contests');
    expect(c.serverClockOffsetMs).toBeGreaterThan(88_000);
    expect(c.serverClockOffsetMs).toBeLessThan(92_000);
  });
});
