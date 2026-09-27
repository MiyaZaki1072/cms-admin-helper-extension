import { useEffect, useState } from 'preact/hooks';
import type { ContestTimes } from '@/core/model';
import { countdown } from '@/core/time';
import { type LiveStatus, fetchStatus } from '@/features/shortcuts/actions';
import { loadRoster } from '@/features/tracker/roster';
import { useHelper } from '../context';

export const STATUS_POLL_MS = 15_000;

/** Contest countdown, submissions by state, queue length and workers, refreshed every 15 s. */
export function StatusBar() {
  const { client, contest, visible } = useHelper();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [times, setTimes] = useState<ContestTimes | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!contest) return;
    loadRoster(client, contest.id).then(
      (r) => setTimes(r.times),
      () => setTimes(null),
    );
  }, [client, contest?.id]);

  useEffect(() => {
    if (!visible || !contest) return undefined;
    let live = true;
    const poll = () => void fetchStatus(client, contest.id).then((s) => live && setStatus(s));
    poll();
    const statusTimer = setInterval(poll, STATUS_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearInterval(statusTimer);
      clearInterval(clock);
    };
  }, [client, contest?.id, visible]);

  if (!contest) return null;
  const serverNow = now + (client.serverClockOffsetMs ?? 0);
  const s = status?.submissions;
  const pending = s ? (s.compiling ?? 0) + (s.evaluating ?? 0) + (s.scoring ?? 0) : null;
  return (
    <div class="cah-statusbar" data-testid="status-bar">
      {times && times.start > 0 && (
        <span>
          <strong>
            Contest{' '}
            {countdown(serverNow, {
              start: times.start * 1000,
              stop: times.stop * 1000,
              analysisStart: times.analysisStart * 1000,
              analysisStop: times.analysisStop * 1000,
            })}
          </strong>
        </span>
      )}
      {s && (
        <span title="Submissions by state">
          {s.total ?? 0} submissions: {s.scored ?? 0} scored, <span class={pending ? 'cah-busy' : ''}>{pending} in progress</span>, {s.compilation_fail ?? 0} compile errors
        </span>
      )}
      {status?.queueLength !== null && status?.queueLength !== undefined && (
        <span class={status.queueLength > 20 ? 'cah-busy' : ''}>Queue {status.queueLength}</span>
      )}
      {status?.workers && (
        <span class={status.workers.connected < status.workers.total ? 'cah-busy' : ''}>
          Workers {status.workers.connected}/{status.workers.total} up, {status.workers.busy} busy
        </span>
      )}
      {status && status.errors.length > 0 && <span class="cah-error-text" title={status.errors.join('\n')}>Some services are not responding</span>}
    </div>
  );
}
