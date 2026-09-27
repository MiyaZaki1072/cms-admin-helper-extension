import { useEffect, useState } from 'preact/hooks';
import { logAudit } from '@/core/audit';
import type { AwsClient } from '@/core/aws-client';
import type { Submission } from '@/core/model';
import { formatTime } from '@/core/time';
import { type PickMode, buildSubmissionZip, fetchRankingCsv, pickSubmissions } from '@/features/shortcuts/actions';
import type { Roster } from '@/features/tracker/roster';
import { useHelper } from '../context';
import { downloadText, fileStamp } from '../download';

/** Ranking snapshots keep running while this AWS tab stays open, across helper tabs. */
const snapshot = {
  timer: null as ReturnType<typeof setInterval> | null,
  contestId: null as number | null,
  minutes: 10,
  count: 0,
  last: null as number | null,
  error: null as string | null,
  listeners: new Set<() => void>(),
};

async function takeSnapshot(client: AwsClient, contestId: number, name: string): Promise<void> {
  try {
    const csv = await fetchRankingCsv(client, contestId);
    downloadText(`ranking-${name}-${fileStamp()}.csv`, csv);
    snapshot.count++;
    snapshot.last = Date.now();
    snapshot.error = null;
  } catch (err) {
    snapshot.error = String(err);
  }
  for (const l of snapshot.listeners) l();
}

export function SnapshotCard() {
  const { client, contest } = useHelper();
  const [, setTick] = useState(0);
  const [minutes, setMinutes] = useState(snapshot.minutes);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    snapshot.listeners.add(l);
    return () => void snapshot.listeners.delete(l);
  }, []);
  if (!contest) return null;
  const running = snapshot.timer !== null && snapshot.contestId === contest.id;

  const start = () => {
    if (snapshot.timer) clearInterval(snapshot.timer);
    snapshot.contestId = contest.id;
    snapshot.minutes = minutes;
    snapshot.timer = setInterval(() => void takeSnapshot(client, contest.id, contest.name), minutes * 60_000);
    void takeSnapshot(client, contest.id, contest.name);
    void logAudit({ action: 'Ranking snapshots started', contestId: contest.id, targets: [], result: 'ok', details: `every ${minutes} min` });
  };
  const stop = () => {
    if (snapshot.timer) clearInterval(snapshot.timer);
    snapshot.timer = null;
    setTick((t) => t + 1);
  };

  return (
    <div class="cah-card" data-testid="snapshot-card">
      <h3>Ranking snapshots</h3>
      <div class="cah-toolbar">
        <button type="button" onClick={() => void takeSnapshot(client, contest.id, contest.name)}>
          Download ranking CSV now
        </button>
        <label>
          every{' '}
          <select value={minutes} onChange={(e) => setMinutes(Number(e.currentTarget.value))} aria-label="Snapshot interval" disabled={running}>
            {[5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" onClick={start}>
            Start
          </button>
        )}
      </div>
      <p class="cah-muted cah-small">
        {running ? `Saving a snapshot every ${snapshot.minutes} min while this AWS tab stays open. ` : ''}
        {snapshot.count > 0 && snapshot.last !== null && `${snapshot.count} saved, last at ${formatTime(snapshot.last)}.`}
      </p>
      {snapshot.error && <p class="cah-error-text">{snapshot.error}</p>}
    </div>
  );
}

export function ZipCard({ roster, submissions }: { roster: Roster; submissions: readonly Submission[] }) {
  const { client, contest } = useHelper();
  const [mode, setMode] = useState<PickMode>('best');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!contest) return null;
  const picked = pickSubmissions(submissions, mode, taskId);

  return (
    <div class="cah-card" data-testid="zip-card">
      <h3>Download submissions</h3>
      <div class="cah-toolbar">
        <select value={mode} onChange={(e) => setMode(e.currentTarget.value as PickMode)} aria-label="Which submission">
          <option value="best">Best of each contestant</option>
          <option value="last">Last of each contestant</option>
        </select>
        <select value={taskId ?? ''} onChange={(e) => setTaskId(e.currentTarget.value ? Number(e.currentTarget.value) : null)} aria-label="Zip task">
          <option value="">All tasks</option>
          {roster.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={picked.length === 0 || progress !== null}
          onClick={() => {
            setError(null);
            setProgress({ done: 0, total: picked.reduce((n, s) => n + s.files.length, 0) });
            buildSubmissionZip(client, picked, (done, total) => setProgress({ done, total }))
              .then((blob) => downloadText(`submissions-${contest.name}-${mode}-${fileStamp()}.zip`, blob))
              .catch((err: unknown) => setError(String(err)))
              .finally(() => setProgress(null));
          }}
        >
          Download zip ({picked.length})
        </button>
      </div>
      {progress && (
        <div class="cah-progress">
          <progress max={progress.total || 1} value={progress.done} />
          <span>
            {progress.done}/{progress.total} files
          </span>
        </div>
      )}
      {submissions.length === 0 && <p class="cah-muted cah-small">Sync the tracker first.</p>}
      {error && <p class="cah-error-text">{error}</p>}
    </div>
  );
}
