/**
 * Global request queue: every request to CMS goes through one of these so the
 * extension never overloads AWS during a contest.
 *
 * - at most `maxInFlight` requests at once (default 2)
 * - at most `maxPerSecond` request starts in any 1 s window (default 4)
 * - a task that throws RetryableError is retried with exponential back-off,
 *   and the whole queue cools down for that delay, not just the one task
 * - pause() / resume() / cancelAll()
 */

export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

/** Thrown by a task to ask the queue to retry it later (5xx, network error). */
export class RetryableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

export interface QueueOptions {
  maxInFlight?: number;
  maxPerSecond?: number;
  maxRetries?: number;
  /** First back-off delay; doubles on every retry. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Name for Web Locks shared by every tab on the same origin, so the
   * in-flight limit holds across all AWS tabs, not just this one. Ignored
   * where navigator.locks is missing.
   */
  lockName?: string;
}

export interface QueueStats {
  inFlight: number;
  pending: number;
  paused: boolean;
}

type Task<T> = (signal: AbortSignal) => Promise<T>;

interface Job {
  task: Task<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  attempt: number;
  controller: AbortController;
  retry: boolean;
}

export class RequestQueue {
  private readonly maxInFlight: number;
  private readonly maxPerSecond: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly lockName: string | null;
  private nextSlot = 0;

  private pending: Job[] = [];
  private running = new Set<Job>();
  private starts: number[] = [];
  private coolDownUntil = 0;
  private paused = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(stats: QueueStats) => void>();

  constructor(options: QueueOptions = {}) {
    this.maxInFlight = options.maxInFlight ?? 2;
    this.maxPerSecond = options.maxPerSecond ?? 4;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.lockName = options.lockName ?? null;
  }

  /** Run the task, holding one of `maxInFlight` origin-wide lock slots when available. */
  private execute(job: Job): Promise<unknown> {
    const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (!this.lockName || !locks) return job.task(job.controller.signal);
    const slot = this.nextSlot++ % this.maxInFlight;
    return locks.request(`${this.lockName}-${slot}`, { signal: job.controller.signal }, () => job.task(job.controller.signal));
  }

  /**
   * Queue a task. `retry: false` for requests that must not be repeated
   * automatically (form POSTs that create things).
   */
  run<T>(task: Task<T>, options: { signal?: AbortSignal; retry?: boolean } = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const job: Job = {
        task: task as Task<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        attempt: 0,
        controller,
        retry: options.retry ?? true,
      };
      if (options.signal) {
        if (options.signal.aborted) {
          reject(new CancelledError());
          return;
        }
        options.signal.addEventListener('abort', () => this.abortJob(job), { once: true });
      }
      this.pending.push(job);
      this.changed();
      this.pump();
    });
  }

  pause(): void {
    this.paused = true;
    this.changed();
  }

  resume(): void {
    this.paused = false;
    this.changed();
    this.pump();
  }

  /** Reject every queued task and abort the running ones. */
  cancelAll(): void {
    for (const job of [...this.pending, ...this.running]) this.abortJob(job);
  }

  get stats(): QueueStats {
    return { inFlight: this.running.size, pending: this.pending.length, paused: this.paused };
  }

  onChange(listener: (stats: QueueStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private abortJob(job: Job): void {
    const index = this.pending.indexOf(job);
    if (index >= 0) this.pending.splice(index, 1);
    job.controller.abort();
    job.reject(new CancelledError());
    this.changed();
  }

  private changed(): void {
    const stats = this.stats;
    for (const listener of this.listeners) listener(stats);
  }

  private pump(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (!this.paused && this.pending.length > 0 && this.running.size < this.maxInFlight) {
      const now = Date.now();
      if (now < this.coolDownUntil) {
        this.schedule(this.coolDownUntil - now);
        return;
      }
      this.starts = this.starts.filter((t) => now - t < 1000);
      if (this.starts.length >= this.maxPerSecond) {
        this.schedule(1000 - (now - this.starts[0]!));
        return;
      }
      const job = this.pending.shift()!;
      this.starts.push(now);
      this.start(job);
    }
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pump();
    }, Math.max(1, delay));
  }

  private start(job: Job): void {
    this.running.add(job);
    this.changed();
    this.execute(job).then(
      (value) => this.finish(job, () => job.resolve(value)),
      (error: unknown) => {
        if (job.controller.signal.aborted) {
          this.finish(job, () => job.reject(new CancelledError()));
        } else if (error instanceof RetryableError && job.retry && job.attempt < this.maxRetries) {
          const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** job.attempt);
          job.attempt += 1;
          this.coolDownUntil = Math.max(this.coolDownUntil, Date.now() + delay);
          this.finish(job, () => this.pending.unshift(job));
        } else {
          this.finish(job, () => job.reject(error instanceof RetryableError && error.cause ? error.cause : error));
        }
      },
    );
  }

  private finish(job: Job, settle: () => void): void {
    this.running.delete(job);
    settle();
    this.changed();
    this.pump();
  }
}
