/**
 * The content script's view of one contest's submission index. The data
 * lives in the background (IndexedDB); this keeps an in-memory copy and runs
 * syncs against AWS.
 */
import type { AwsClient } from '@/core/aws-client';
import { type TrackerMeta, request } from '@/core/messaging';
import type { Submission } from '@/core/model';
import { type SyncOutcome, type SyncProgress, submissionsPageFetcher, syncSubmissions } from './sync';

export class TrackerStore {
  submissions = new Map<number, Submission>();
  meta: TrackerMeta = { lastSyncAt: null, complete: false, total: null };
  private listeners = new Set<() => void>();
  private running: Promise<SyncOutcome> | null = null;

  constructor(
    readonly client: AwsClient,
    readonly contestId: number,
  ) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    const { submissions, meta } = await request({ type: 'tracker:load', contestId: this.contestId });
    this.submissions = new Map(submissions.map((s) => [s.id, s]));
    this.meta = meta;
    this.emit();
  }

  get syncing(): boolean {
    return this.running !== null;
  }

  /** Sync with AWS; concurrent calls share one run. */
  sync(options: { full?: boolean; signal?: AbortSignal; onProgress?: (p: SyncProgress) => void } = {}): Promise<SyncOutcome> {
    this.running ??= (async () => {
      try {
        const outcome = await syncSubmissions({
          fetchPage: submissionsPageFetcher(this.client, this.contestId),
          known: this.submissions,
          complete: this.meta.complete,
          full: options.full,
          signal: options.signal,
          onProgress: options.onProgress,
        });
        const meta: TrackerMeta = { lastSyncAt: Date.now(), complete: outcome.complete, total: outcome.total };
        await request({ type: 'tracker:save', contestId: this.contestId, put: outcome.put, remove: outcome.remove, meta });
        for (const s of outcome.put) this.submissions.set(s.id, s);
        for (const id of outcome.remove) this.submissions.delete(id);
        this.meta = meta;
        return outcome;
      } finally {
        this.running = null;
        this.emit();
      }
    })();
    this.emit();
    return this.running;
  }

  async clear(): Promise<void> {
    await request({ type: 'tracker:clear', contestId: this.contestId });
    this.submissions.clear();
    this.meta = { lastSyncAt: null, complete: false, total: null };
    this.emit();
  }
}
