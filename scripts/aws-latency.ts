/**
 * Measure how fast AWS answers while something else runs (a sync, an import,
 * cms-stresstest.sh). Logs in as admin and requests a few AWS pages at a
 * steady rate, then prints median / 95th percentile / slowest response time.
 * Read-only.
 *
 *   pnpm latency [--seconds 60] [--rate 2] [--base http://localhost:8889]
 */
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return (i >= 0 ? args[i + 1] : undefined) ?? fallback;
};
const BASE = opt('base', 'http://localhost:8889').replace(/\/$/, '');
const SECONDS = Number(opt('seconds', '60'));
const RATE = Number(opt('rate', '2'));
const PATHS = ['/contest/1/submissions?page=0', '/contest/1/users', '/contest/1/user/1/edit', '/contest/1/ranking'];

const cookies = new Map<string, string>();
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let url = new URL(path, BASE).href;
  let method = init.method ?? 'GET';
  let body = init.body;
  for (let hop = 0; hop < 5; hop++) {
    const headers = new Headers(init.headers);
    headers.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    const res = await fetch(url, { method, body, headers, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).href;
      method = 'GET';
      body = undefined;
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}

async function main() {
  const loginPage = await (await request('/login')).text();
  const xsrf = /name="_xsrf" value="([^"]+)"/.exec(loginPage)?.[1] ?? '';
  await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'admin', password: 'admin', _xsrf: xsrf, next: '/' }).toString(),
  });

  const times: number[] = [];
  let errors = 0;
  const end = Date.now() + SECONDS * 1000;
  let n = 0;
  const inflight: Promise<void>[] = [];
  while (Date.now() < end) {
    const path = PATHS[n++ % PATHS.length]!;
    inflight.push(
      (async () => {
        const t0 = performance.now();
        try {
          const res = await request(path);
          await res.text();
          if (!res.ok || res.url.includes('/login')) errors++;
          else times.push(performance.now() - t0);
        } catch {
          errors++;
        }
      })(),
    );
    await new Promise((r) => setTimeout(r, 1000 / RATE));
  }
  await Promise.all(inflight);
  times.sort((a, b) => a - b);
  const at = (q: number) => Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? NaN);
  console.log(
    JSON.stringify({ base: BASE, seconds: SECONDS, requests: times.length + errors, errors, p50_ms: at(0.5), p95_ms: at(0.95), max_ms: Math.round(times.at(-1) ?? NaN) }),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
