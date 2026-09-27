import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CancelledError } from '@/core/queue';
import { formatTime } from '@/core/time';
import { byUser, summarizePerson } from '@/features/tracker/analysis';
import { pushRecent } from '@/features/tracker/recent';
import type { SyncOutcome, SyncProgress } from '@/features/tracker/sync';
import { useHelper } from '../context';
import { CompareView } from '../tracker/CompareView';
import { ContestantPicker } from '../tracker/ContestantPicker';
import { GridView } from '../tracker/GridView';
import { PersonView } from '../tracker/PersonView';
import { SubmissionsView } from '../tracker/SubmissionsView';
import { useTrackerData } from '../tracker/useTracker';

const LIVE_CHOICES = [0, 15, 30, 60] as const;
const VIEWS = ['People', 'Grid', 'Submissions', 'Compare'] as const;
type View = (typeof VIEWS)[number];

export function TrackerTab() {
  const { tracker, visible, contest, personRequest } = useHelper();
  const { submissions, roster, rosterError, reloadRoster } = useTrackerData();
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [last, setLast] = useState<SyncOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('People');
  const [person, setPerson] = useState<number | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [recentVersion, setRecentVersion] = useState(0);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tracker) return;
    setLoaded(false);
    setLast(null);
    setPerson(null);
    setCompare([]);
    tracker.load().then(
      () => setLoaded(true),
      (err: unknown) => setError(String(err)),
    );
  }, [tracker]);

  // Opened from an AWS page ("only" link). Consumed once the contest's tracker
  // exists, after the reset above has run.
  const consumed = useRef(0);
  useEffect(() => {
    if (!personRequest || !tracker || consumed.current === personRequest.nonce) return;
    consumed.current = personRequest.nonce;
    openPerson(personRequest.userId);
  }, [personRequest?.nonce, tracker]);

  const syncAbort = useRef<AbortController | null>(null);
  const runSync = async (full = false) => {
    if (!tracker || tracker.syncing) return;
    setError(null);
    setProgress({ fetched: 0, pages: 1 });
    const abort = new AbortController();
    syncAbort.current = abort;
    try {
      setLast(await tracker.sync({ full, onProgress: setProgress, signal: abort.signal }));
    } catch (err) {
      if (!(err instanceof CancelledError)) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  // First open of a contest with an empty index: sync right away.
  useEffect(() => {
    if (loaded && tracker && tracker.meta.lastSyncAt === null && !tracker.syncing) void runSync();
  }, [loaded, tracker]);

  // Live mode: re-sync every N seconds while the helper is visible.
  useEffect(() => {
    if (!live || !visible || !tracker || !loaded) return undefined;
    const timer = setInterval(() => void runSync(), live * 1000);
    return () => clearInterval(timer);
  }, [live, visible, tracker, loaded]);

  const stats = useMemo(() => {
    const map = new Map<number, { total: number; submissions: number }>();
    for (const [userId, list] of byUser(submissions)) {
      const s = summarizePerson(userId, list, roster?.tasks ?? []);
      map.set(userId, { total: s.total, submissions: s.submissions });
    }
    return map;
  }, [submissions, roster]);

  function openPerson(userId: number) {
    setView('People');
    setPerson(userId);
    if (contest) void pushRecent(contest.id, userId).then(() => setRecentVersion((v) => v + 1));
  }

  if (!contest || !tracker) return <p class="cah-pad cah-muted">No contest selected.</p>;
  const syncing = tracker.syncing;

  return (
    <section
      class="cah-panel"
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
          e.preventDefault();
          setView('People');
          setTimeout(() => search.current?.focus(), 0);
        }
      }}
    >
      <div class="cah-toolbar">
        <button type="button" class="cah-primary" disabled={syncing} onClick={() => void runSync()}>
          Sync now
        </button>
        <button type="button" disabled={syncing} onClick={() => void runSync(true)} title="Re-read every page">
          Full resync
        </button>
        <label>
          Live{' '}
          <select value={live} onChange={(e) => setLive(Number(e.currentTarget.value))} aria-label="Live sync interval">
            {LIVE_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Off' : `every ${s} s`}
              </option>
            ))}
          </select>
        </label>
        <span class="cah-status" data-testid="tracker-status">
          <strong>{tracker.submissions.size}</strong> submissions indexed
          {tracker.meta.total !== null && tracker.meta.total !== tracker.submissions.size && ` (AWS reports ${tracker.meta.total})`}
          {tracker.meta.lastSyncAt !== null && <> · last sync {formatTime(tracker.meta.lastSyncAt)}</>}
          {last && (
            <span data-testid="tracker-last">
              {' '}
              · {last.requests} {last.requests === 1 ? 'request' : 'requests'}, {last.added} new, {last.updated} changed
              {last.remove.length > 0 && `, ${last.remove.length} removed`}
            </span>
          )}
        </span>
        <span class="cah-spacer" />
        <button
          type="button"
          disabled={syncing}
          onClick={() => {
            reloadRoster();
            void tracker.clear().then(() => setLast(null));
          }}
        >
          Clear cache
        </button>
      </div>

      {progress && (
        <div class="cah-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.pages} aria-valuenow={progress.fetched}>
          <progress max={progress.pages} value={progress.fetched} />
          <span>
            Page {Math.min(progress.fetched + 1, progress.pages)} of {progress.pages}
          </span>
          <button type="button" onClick={() => syncAbort.current?.abort()}>
            Cancel
          </button>
        </div>
      )}
      {error && <div class="cah-banner cah-banner-error">{error}</div>}
      {rosterError && (
        <div class="cah-banner cah-banner-error">
          Could not load the contestant list: {rosterError}{' '}
          <button type="button" onClick={reloadRoster}>
            Retry
          </button>
        </div>
      )}

      <nav class="cah-subnav" aria-label="Tracker views">
        {VIEWS.map((v) => (
          <button key={v} type="button" class={view === v ? 'cah-subnav-on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </nav>

      {!roster && !rosterError && <p class="cah-muted">Loading contestants…</p>}
      {roster && view === 'People' && (
        <div class="cah-split">
          <ContestantPicker
            contestId={contest.id}
            contestants={roster.contestants}
            selected={person === null ? [] : [person]}
            onPick={openPerson}
            stats={stats}
            inputRef={search}
            recentVersion={recentVersion}
          />
          {person === null ? (
            <p class="cah-muted">Pick a contestant to see everything they did.</p>
          ) : (
            <PersonView userId={person} roster={roster} submissions={submissions} />
          )}
        </div>
      )}
      {roster && view === 'Grid' && <GridView roster={roster} submissions={submissions} onPick={openPerson} />}
      {roster && view === 'Submissions' && <SubmissionsView roster={roster} submissions={submissions} onUser={openPerson} />}
      {roster && view === 'Compare' && (
        <CompareView contestId={contest.id} roster={roster} submissions={submissions} selected={compare} onChange={setCompare} />
      )}
    </section>
  );
}
