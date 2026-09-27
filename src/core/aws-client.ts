/**
 * The only way the extension talks to CMS. Runs in the content script in the
 * AWS tab, so every request is same-origin and uses the admin's own session.
 *
 * AWS has no JSON API: pages are HTML, changes are form POSTs that answer
 * with a redirect. Success is judged by where the redirect goes (and, for
 * forms that redirect to the same page either way, by re-reading the page).
 */
import { RequestQueue, RetryableError } from './queue';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(
      status === 403
        ? 'Your admin account does not have permission for this action.'
        : status === 404
          ? `Not found: ${url}`
          : `CMS answered HTTP ${status} for ${url}`,
    );
    this.name = 'HttpError';
  }
}

export class NotLoggedInError extends Error {
  constructor() {
    super('You are not logged in to AWS (or the session expired). Log in and try again.');
    this.name = 'NotLoggedInError';
  }
}

export class RpcError extends Error {
  constructor(
    readonly method: string,
    message: string,
  ) {
    super(`${method} failed: ${message}`);
    this.name = 'RpcError';
  }
}

/** A form value; null/undefined fields are left out (like an unticked checkbox). */
export type FieldValue = string | number | boolean | null | undefined;
export type FormFields = Array<[string, string]> | Record<string, FieldValue>;

export interface PostResult {
  /** URL after redirects: where AWS sent us. */
  url: string;
  /** Path of `url` relative to the AWS base, without query, e.g. "user/12". */
  path: string;
  status: number;
  redirected: boolean;
  /** Parsed body when it is HTML. */
  doc: Document | null;
}

export interface AwsNotification {
  type: 'notification' | 'new_question';
  /** Seconds since the epoch (UTC). */
  timestamp: number;
  subject: string;
  text: string;
  contest_id?: number;
}

export interface AwsClientOptions {
  /** AWS base URL with trailing slash. */
  baseUrl: string;
  fetch?: typeof fetch;
  queue?: RequestQueue;
  /** Returns document.cookie; injectable for tests. */
  cookies?: () => string;
}

declare global {
  // Firefox content scripts: fetch that runs as the page (page origin + cookies).
  // eslint-disable-next-line no-var
  var content: { fetch?: typeof fetch } | undefined;
}

/** In Firefox, content.fetch makes requests as the page; elsewhere plain fetch does. */
export function pageFetch(): typeof fetch {
  const firefoxFetch = typeof content !== 'undefined' ? content?.fetch : undefined;
  return typeof firefoxFetch === 'function' ? firefoxFetch.bind(content) : fetch.bind(globalThis);
}

export class AwsClient {
  readonly baseUrl: string;
  readonly queue: RequestQueue;
  private readonly fetchFn: typeof fetch;
  private readonly cookies: () => string;
  /** Server clock minus local clock, from the last response's Date header (ms). */
  serverClockOffsetMs: number | null = null;
  /** Response times of the last requests (ms), newest last. */
  private timings: number[] = [];

  constructor(options: AwsClientOptions) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`;
    this.fetchFn = options.fetch ?? pageFetch();
    this.queue = options.queue ?? new RequestQueue({ lockName: 'cms-admin-helper-aws' });
    this.cookies = options.cookies ?? (() => document.cookie);
  }

  /** Absolute URL for an AWS path such as "contest/1/users" or "/contest/1/users". */
  url(path: string): string {
    return new URL(path.replace(/^\/+/, ''), this.baseUrl).href;
  }

  /** "contest/1/users" for an absolute AWS URL (query and hash dropped). */
  pathOf(url: string): string {
    const u = new URL(url);
    const base = new URL(this.baseUrl);
    return u.pathname.startsWith(base.pathname) ? u.pathname.slice(base.pathname.length) : u.pathname.replace(/^\//, '');
  }

  xsrfToken(): string {
    const match = /(?:^|;\s*)_xsrf=([^;]*)/.exec(this.cookies());
    if (!match?.[1]) throw new NotLoggedInError();
    return decodeURIComponent(match[1]);
  }

  /** GET a page and parse it. Throws NotLoggedInError if AWS sends us to /login. */
  async getPage(path: string, options: { signal?: AbortSignal } = {}): Promise<{ doc: Document; url: string }> {
    const { res, body } = await this.send(path, { method: 'GET' }, { retry: true, signal: options.signal });
    return { doc: parseHtml(body), url: res.url };
  }

  /** GET a non-HTML resource (CSV, source file) as text. */
  async getText(path: string, options: { signal?: AbortSignal } = {}): Promise<string> {
    return (await this.send(path, { method: 'GET' }, { retry: true, signal: options.signal })).body;
  }

  /**
   * POST a form the way AWS's own pages do, adding `_xsrf`. Never retried
   * automatically: a POST that timed out may still have been applied.
   */
  async postForm(
    path: string,
    fields: FormFields,
    options: { multipart?: boolean; signal?: AbortSignal } = {},
  ): Promise<PostResult> {
    const entries = normalizeFields(fields).filter(([name]) => name !== '_xsrf');
    entries.unshift(['_xsrf', this.xsrfToken()]);
    let body: BodyInit;
    if (options.multipart) {
      const form = new FormData();
      for (const [name, value] of entries) form.append(name, value);
      body = form;
    } else {
      body = new URLSearchParams(entries);
    }
    const { res, body: text } = await this.send(path, { method: 'POST', body }, { retry: false, signal: options.signal });
    const isHtml = (res.headers.get('content-type') ?? '').includes('html');
    return {
      url: res.url,
      path: this.pathOf(res.url),
      status: res.status,
      redirected: res.redirected,
      doc: isHtml ? parseHtml(text) : null,
    };
  }

  /**
   * Read and clear AWS's notification queue. The queue is shared by every
   * admin and every AWS tab, and AWS's own pages poll it every 15 s, so an
   * empty result does not prove an operation succeeded.
   */
  async readNotifications(): Promise<AwsNotification[]> {
    // A future last_notification skips old unanswered questions.
    const since = Math.floor(Date.now() / 1000) + 3600;
    const text = await this.getText(`notifications?last_notification=${since}`);
    return (JSON.parse(text) as AwsNotification[]).filter((n) => n.type === 'notification');
  }

  /** Call an RPC method through AWS, as web_rpc.js does. */
  async rpc<T>(service: string, shard: number, method: string, args: Record<string, unknown>): Promise<T> {
    const { body } = await this.send(
      `rpc/${service}/${shard}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-XSRFToken': this.xsrfToken() },
        body: JSON.stringify(args),
      },
      { retry: true },
    );
    const reply = JSON.parse(body) as { data: T; error: string | null };
    if (reply.error) throw new RpcError(`${service}.${method}`, reply.error);
    return reply.data;
  }

  private async send(
    path: string,
    init: RequestInit,
    options: { retry: boolean; signal?: AbortSignal },
  ): Promise<{ res: Response; body: string }> {
    const url = this.url(path);
    return this.queue.run(
      async (signal) => {
        let res: Response;
        const started = Date.now();
        try {
          res = await this.fetchFn(url, { ...init, credentials: 'include', redirect: 'follow', signal });
        } catch (err) {
          if (signal.aborted) throw err;
          throw new RetryableError(`Network error for ${url}`, err);
        }
        this.noteServerDate(res);
        if (res.status >= 500) {
          throw new RetryableError(`HTTP ${res.status}`, new HttpError(res.status, url));
        }
        if (this.pathOf(res.url) === 'login') throw new NotLoggedInError();
        if (!res.ok) throw new HttpError(res.status, url);
        const body = await res.text();
        this.recordTiming(Date.now() - started);
        return { res, body };
      },
      { retry: options.retry, signal: options.signal },
    );
  }

  private recordTiming(ms: number): void {
    this.timings.push(ms);
    if (this.timings.length > 200) this.timings.shift();
  }

  /** How fast AWS answered recently: median, 95th percentile and slowest (ms). */
  latency(): { count: number; p50: number; p95: number; max: number } | null {
    if (this.timings.length === 0) return null;
    const sorted = [...this.timings].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1)! };
  }

  private noteServerDate(res: Response): void {
    const date = res.headers.get('date');
    const serverMs = date ? Date.parse(date) : NaN;
    if (!Number.isNaN(serverMs)) this.serverClockOffsetMs = serverMs - Date.now();
  }
}

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function normalizeFields(fields: FormFields): Array<[string, string]> {
  if (Array.isArray(fields)) return fields.map(([k, v]) => [k, v]);
  const out: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === false) continue;
    out.push([name, value === true ? 'on' : String(value)]);
  }
  return out;
}
