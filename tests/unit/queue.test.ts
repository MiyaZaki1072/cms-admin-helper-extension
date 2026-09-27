import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, RequestQueue, RetryableError } from '@/core/queue';

/** A task that resolves when we say so. */
function deferredTask() {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const started = vi.fn();
  const task = (signal: AbortSignal) => {
    started(signal);
    return new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return { task, started, resolve: (v = 'ok') => resolve(v), reject: (e: unknown) => reject(e) };
}

describe('RequestQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs at most 2 tasks at once', async () => {
    const q = new RequestQueue();
    const tasks = [deferredTask(), deferredTask(), deferredTask()];
    const results = tasks.map((t) => q.run(t.task));
    expect(tasks.map((t) => t.started.mock.calls.length)).toEqual([1, 1, 0]);
    expect(q.stats).toEqual({ inFlight: 2, pending: 1, paused: false });

    tasks[0]!.resolve('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(tasks[2]!.started).toHaveBeenCalledTimes(1);
    tasks[1]!.resolve('b');
    tasks[2]!.resolve('c');
    await expect(Promise.all(results)).resolves.toEqual(['a', 'b', 'c']);
  });

  it('starts at most 4 tasks per second', async () => {
    const q = new RequestQueue({ maxInFlight: 10 });
    const starts: number[] = [];
    const runs = Array.from({ length: 9 }, () =>
      q.run(async () => {
        starts.push(Date.now());
      }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.all(runs);
    const t0 = starts[0]!;
    const offsets = starts.map((t) => t - t0);
    expect(offsets.slice(0, 4).every((o) => o < 1000)).toBe(true);
    expect(offsets.slice(4, 8).every((o) => o >= 1000 && o < 2000)).toBe(true);
    expect(offsets[8]).toBeGreaterThanOrEqual(2000);
  });

  it('retries RetryableError with exponential back-off, then gives up', async () => {
    const q = new RequestQueue({ baseDelayMs: 100, maxRetries: 2 });
    const cause = new Error('HTTP 502');
    const attempts: number[] = [];
    const run = q.run(async () => {
      attempts.push(Date.now());
      throw new RetryableError('502', cause);
    });
    const settled = run.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await settled).toBe(cause);
    expect(attempts).toHaveLength(3);
    expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(100);
    expect(attempts[2]! - attempts[1]!).toBeGreaterThanOrEqual(200);
  });

  it('does not retry when retry is false', async () => {
    const q = new RequestQueue();
    const task = vi.fn(async () => {
      throw new RetryableError('boom');
    });
    await expect(q.run(task, { retry: false })).rejects.toThrow('boom');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('cools the whole queue down after a retryable failure', async () => {
    const q = new RequestQueue({ baseDelayMs: 500, maxInFlight: 1 });
    let failed = false;
    const first = q.run(async () => {
      if (!failed) {
        failed = true;
        throw new RetryableError('503');
      }
      return 'first';
    });
    const secondStart = vi.fn();
    const second = q.run(async () => {
      secondStart(Date.now());
      return 'second';
    });
    const t0 = Date.now();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(secondStart.mock.calls[0]![0] - t0).toBeGreaterThanOrEqual(500);
  });

  it('pause holds new starts until resume', async () => {
    const q = new RequestQueue();
    q.pause();
    const t = deferredTask();
    const run = q.run(t.task);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.started).not.toHaveBeenCalled();
    q.resume();
    expect(t.started).toHaveBeenCalled();
    t.resolve('done');
    await expect(run).resolves.toBe('done');
  });

  it('cancelAll rejects queued tasks and aborts running ones', async () => {
    const q = new RequestQueue({ maxInFlight: 1 });
    const running = deferredTask();
    const a = q.run(running.task);
    const b = q.run(async () => 'never');
    q.cancelAll();
    await expect(a).rejects.toBeInstanceOf(CancelledError);
    await expect(b).rejects.toBeInstanceOf(CancelledError);
    expect((running.started.mock.calls[0]![0] as AbortSignal).aborted).toBe(true);
  });

  it('honours a per-task AbortSignal', async () => {
    const q = new RequestQueue({ maxInFlight: 1 });
    const blocker = deferredTask();
    void q.run(blocker.task);
    const controller = new AbortController();
    const run = q.run(async () => 'x', { signal: controller.signal });
    controller.abort();
    await expect(run).rejects.toBeInstanceOf(CancelledError);
    expect(q.stats.pending).toBe(0);
  });
});
