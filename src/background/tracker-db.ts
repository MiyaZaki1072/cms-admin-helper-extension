/**
 * Submission index for the tracker, in the background worker's IndexedDB:
 * one database per AWS origin + contest, so it survives tab reloads and is
 * not visible to the AWS page.
 */
import type { TrackerMeta } from '@/core/messaging';
import type { Submission } from '@/core/model';

const VERSION = 1;
const EMPTY_META: TrackerMeta = { lastSyncAt: null, complete: false, total: null };

export function trackerDbName(origin: string, contestId: number): string {
  return `cah-tracker|${origin}|${contestId}`;
}

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const submissions = db.createObjectStore('submissions', { keyPath: 'id' });
      submissions.createIndex('userId', 'userId');
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error(`Cannot open ${name}`));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function withDb<T>(name: string, run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await open(name);
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

export function loadTracker(name: string): Promise<{ submissions: Submission[]; meta: TrackerMeta }> {
  return withDb(name, async (db) => {
    const tx = db.transaction(['submissions', 'meta'], 'readonly');
    const [submissions, meta] = await Promise.all([
      result(tx.objectStore('submissions').getAll() as IDBRequest<Submission[]>),
      result(tx.objectStore('meta').get('meta') as IDBRequest<TrackerMeta | undefined>),
    ]);
    return { submissions, meta: { ...EMPTY_META, ...meta } };
  });
}

export function saveTracker(name: string, put: Submission[], remove: number[], meta: TrackerMeta): Promise<void> {
  return withDb(name, async (db) => {
    const tx = db.transaction(['submissions', 'meta'], 'readwrite');
    const store = tx.objectStore('submissions');
    for (const s of put) store.put(s);
    for (const id of remove) store.delete(id);
    tx.objectStore('meta').put(meta, 'meta');
    await done(tx);
  });
}

export function clearTracker(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`Cannot delete ${name}`));
    // Another connection is open; the delete completes when it closes.
    req.onblocked = () => resolve();
  });
}
