import { describe, expect, it } from 'vitest';
import type { Submission, SubmissionStatus } from '@/core/model';
import type { SubmissionsPage } from '@/core/parsers';
import { type FetchPage, syncSubmissions } from '@/features/tracker/sync';

function sub(id: number, status: SubmissionStatus = 'scored', score: number | null = 100): Submission {
  return {
    id,
    timestamp: id * 1000,
    contestId: 1,
    userId: (id % 5) + 1,
    username: `stu00${(id % 5) + 1}`,
    taskId: 1,
    taskName: 'sum',
    status,
    statusText: status === 'scored' ? `Scored (${score} / 100.0)` : status,
    score: status === 'scored' ? score : null,
    maxScore: status === 'scored' ? 100 : null,
    official: true,
    token: false,
    comment: '',
    datasetId: 1,
    files: [],
  };
}

/** A fake AWS: `all` newest first, 50 per page. Counts requests. */
function server(all: Submission[], perPage = 50) {
  const sorted = [...all].sort((a, b) => b.timestamp - a.timestamp);
  const calls: number[] = [];
  const fetchPage: FetchPage = async (page) => {
    calls.push(page);
    const pages = Math.ceil(sorted.length / perPage);
    const result: SubmissionsPage = {
      submissions: sorted.slice(page * perPage, (page + 1) * perPage),
      total: sorted.length,
      pages,
    };
    return result;
  };
  return { fetchPage, calls };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('syncSubmissions', () => {
  it('first sync walks every page', async () => {
    const all = range(1, 300).map((id) => sub(id));
    const { fetchPage, calls } = server(all);
    const progress: number[] = [];
    const out = await syncSubmissions({ fetchPage, known: new Map(), complete: false, onProgress: (p) => progress.push(p.fetched) });
    expect(calls).toEqual([0, 1, 2, 3, 4, 5]);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out).toMatchObject({ requests: 6, added: 300, updated: 0, complete: true, total: 300, fullWalk: true });
    expect(out.put).toHaveLength(300);
  });

  it('second sync with nothing new makes one request', async () => {
    const all = range(1, 300).map((id) => sub(id));
    const { fetchPage, calls } = server(all);
    const known = new Map(all.map((s) => [s.id, s]));
    const out = await syncSubmissions({ fetchPage, known, complete: true });
    expect(calls).toEqual([0]);
    expect(out).toMatchObject({ requests: 1, added: 0, updated: 0, put: [], remove: [], complete: true });
  });

  it('picks up new submissions from page 0 only', async () => {
    const old = range(1, 300).map((id) => sub(id));
    const { fetchPage, calls } = server([...old, ...range(301, 310).map((id) => sub(id))]);
    const out = await syncSubmissions({ fetchPage, known: new Map(old.map((s) => [s.id, s])), complete: true });
    expect(calls).toEqual([0]);
    expect(out.added).toBe(10);
    expect(out.put.map((s) => s.id).sort((a, b) => a - b)).toEqual(range(301, 310));
  });

  it('keeps reading until it has passed the oldest pending submission', async () => {
    const known = range(1, 300).map((id) => (id === 200 ? sub(id, 'evaluating') : sub(id)));
    const now = range(1, 300).map((id) => (id === 200 ? sub(id, 'scored', 60) : sub(id)));
    const { fetchPage, calls } = server(now);
    const out = await syncSubmissions({ fetchPage, known: new Map(known.map((s) => [s.id, s])), complete: true });
    // id 200 is on page 2 (ids 300..251, 250..201, 200..151).
    expect(calls).toEqual([0, 1, 2]);
    expect(out.updated).toBe(1);
    expect(out.put[0]).toMatchObject({ id: 200, status: 'scored', score: 60 });
  });

  it('does a full walk when an earlier sync was cut short', async () => {
    const all = range(1, 300).map((id) => sub(id));
    const { fetchPage, calls } = server(all);
    const partial = new Map(all.filter((s) => s.id > 250).map((s) => [s.id, s]));
    const out = await syncSubmissions({ fetchPage, known: partial, complete: false });
    expect(calls).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.added).toBe(250);
    expect(out.complete).toBe(true);
  });

  it('switches to a full walk when the total shows a gap', async () => {
    const all = range(1, 300).map((id) => sub(id));
    const { fetchPage, calls } = server(all);
    const gappy = new Map(all.filter((s) => s.id > 200 || s.id <= 50).map((s) => [s.id, s]));
    const out = await syncSubmissions({ fetchPage, known: gappy, complete: true });
    expect(calls).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out.added).toBe(150);
  });

  it('a full walk drops submissions that no longer exist', async () => {
    const known = range(1, 120).map((id) => sub(id));
    const { fetchPage } = server(known.filter((s) => s.id % 10 !== 0));
    const out = await syncSubmissions({ fetchPage, known: new Map(known.map((s) => [s.id, s])), complete: true, full: true });
    expect(out.remove.sort((a, b) => a - b)).toEqual(range(1, 12).map((n) => n * 10));
  });

  it('handles a contest with no submissions', async () => {
    const fetchPage: FetchPage = async () => ({ submissions: [], total: 0, pages: 0 });
    const out = await syncSubmissions({ fetchPage, known: new Map(), complete: false });
    expect(out).toMatchObject({ requests: 1, added: 0, complete: true });
  });
});
