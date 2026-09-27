/**
 * Tracker sync: build a local index of a contest's submissions from the
 * paged /contest/{c}/submissions list (50 per page, newest first).
 *
 * - First sync (or after a gap): walk every page. A full walk also finds
 *   submissions that no longer exist (removed participation).
 * - Incremental sync: read from page 0 and stop once a page contains a
 *   known submission and we are past the oldest one still compiling or
 *   evaluating. Normally one request.
 */
import type { AwsClient } from '@/core/aws-client';
import type { Submission, SubmissionStatus } from '@/core/model';
import { parseSubmissionsTable, type SubmissionsPage } from '@/core/parsers';

export type FetchPage = (page: number, signal?: AbortSignal) => Promise<SubmissionsPage>;

export interface SyncProgress {
  /** Pages fetched so far. */
  fetched: number;
  /** Pages AWS has (the most a sync can fetch). */
  pages: number;
}

export interface SyncOutcome {
  requests: number;
  /** New or changed submissions, to store. */
  put: Submission[];
  /** Ids of submissions that no longer exist (full walks only). */
  remove: number[];
  added: number;
  updated: number;
  /** A full walk finished, so the index holds every submission. */
  complete: boolean;
  total: number | null;
  fullWalk: boolean;
}

export const PENDING: ReadonlySet<SubmissionStatus> = new Set(['compiling', 'evaluating', 'scoring']);

export function submissionsPageFetcher(client: AwsClient, contestId: number): FetchPage {
  return async (page, signal) => {
    const { doc } = await client.getPage(`contest/${contestId}/submissions?page=${page}`, { signal });
    return parseSubmissionsTable(doc);
  };
}

function changed(a: Submission, b: Submission): boolean {
  return (
    a.statusText !== b.statusText ||
    a.score !== b.score ||
    a.maxScore !== b.maxScore ||
    a.official !== b.official ||
    a.token !== b.token ||
    a.comment !== b.comment ||
    a.datasetId !== b.datasetId ||
    a.username !== b.username
  );
}

export async function syncSubmissions(options: {
  fetchPage: FetchPage;
  known: ReadonlyMap<number, Submission>;
  /** From the stored meta: whether a full walk has finished before. */
  complete: boolean;
  /** Force a full walk (the "Full resync" button). */
  full?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: SyncProgress) => void;
}): Promise<SyncOutcome> {
  const { fetchPage, known, signal, onProgress } = options;
  let fullWalk = options.full === true || !options.complete || known.size === 0;
  const oldestPending = Math.min(
    ...[...known.values()].filter((s) => PENDING.has(s.status)).map((s) => s.timestamp),
    Number.POSITIVE_INFINITY,
  );

  const put = new Map<number, Submission>();
  const seen = new Set<number>();
  let added = 0;
  let updated = 0;
  let requests = 0;
  let total: number | null = null;
  let pages = 1;
  let sawKnown = false;
  let page = 0;

  for (; page < pages; page++) {
    const result = await fetchPage(page, signal);
    requests++;
    pages = Math.max(result.pages, 1);
    total = result.total ?? total;
    for (const s of result.submissions) {
      seen.add(s.id);
      const old = known.get(s.id);
      if (!old) {
        if (!put.has(s.id)) added++;
        put.set(s.id, s);
      } else {
        sawKnown = true;
        if (changed(old, s)) {
          if (!put.has(s.id)) updated++;
          put.set(s.id, s);
        }
      }
    }
    onProgress?.({ fetched: requests, pages });

    if (!fullWalk && sawKnown) {
      const oldestOnPage = Math.min(...result.submissions.map((s) => s.timestamp), Number.POSITIVE_INFINITY);
      if (oldestOnPage <= oldestPending || !Number.isFinite(oldestPending)) {
        // Stop here unless the counts show a gap (e.g. an earlier sync was cut short).
        const indexed = known.size + added;
        if (total === null || indexed >= total) break;
        fullWalk = true;
      }
    }
  }

  const walkedAll = page >= pages;
  const remove = fullWalk && walkedAll ? [...known.keys()].filter((id) => !seen.has(id)) : [];
  return {
    requests,
    put: [...put.values()],
    remove,
    added,
    updated,
    complete: fullWalk ? walkedAll : options.complete,
    total,
    fullWalk,
  };
}
