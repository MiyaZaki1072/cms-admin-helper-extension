import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearTracker, loadTracker, saveTracker, trackerDbName } from '@/background/tracker-db';
import type { Submission } from '@/core/model';

const s = (id: number, userId: number): Submission => ({
  id,
  timestamp: id,
  contestId: 1,
  userId,
  username: `u${userId}`,
  taskId: 1,
  taskName: 'sum',
  status: 'scored',
  statusText: 'Scored (100.0 / 100.0)',
  score: 100,
  maxScore: 100,
  official: true,
  token: false,
  comment: '',
  datasetId: 1,
  files: [],
});

describe('tracker IndexedDB', () => {
  it('one database per origin and contest', () => {
    expect(trackerDbName('http://10.0.0.5:8889', 3)).toBe('cah-tracker|http://10.0.0.5:8889|3');
  });

  it('starts empty, saves, updates, removes and clears', async () => {
    const name = trackerDbName('http://aws.test', 1);
    expect(await loadTracker(name)).toEqual({ submissions: [], meta: { lastSyncAt: null, complete: false, total: null } });

    await saveTracker(name, [s(1, 1), s(2, 2), s(3, 1)], [], { lastSyncAt: 10, complete: true, total: 3 });
    await saveTracker(name, [{ ...s(2, 2), score: 50 }], [3], { lastSyncAt: 20, complete: true, total: 2 });
    const loaded = await loadTracker(name);
    expect(loaded.submissions.map((x) => [x.id, x.score])).toEqual([
      [1, 100],
      [2, 50],
    ]);
    expect(loaded.meta).toEqual({ lastSyncAt: 20, complete: true, total: 2 });

    await clearTracker(name);
    expect((await loadTracker(name)).submissions).toEqual([]);
  });

  it('keeps contests apart', async () => {
    await saveTracker(trackerDbName('http://aws.test', 7), [s(1, 1)], [], { lastSyncAt: 1, complete: true, total: 1 });
    expect((await loadTracker(trackerDbName('http://aws.test', 8))).submissions).toEqual([]);
  });
});
