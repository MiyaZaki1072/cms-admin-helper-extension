import { useEffect, useState } from 'preact/hooks';
import { PERMISSION_LABEL } from '@/core/connection';
import type { QueueStats } from '@/core/queue';
import { useHelper } from '../context';
import { AnnouncementsCard } from '../tools/AnnouncementsCard';
import { BulkEditCard } from '../tools/BulkEditCard';
import { BulkMessageCard } from '../tools/BulkMessageCard';
import { ChecklistCard } from '../tools/ChecklistCard';
import { QuestionsCard } from '../tools/QuestionsCard';
import { ReevaluateCard } from '../tools/ReevaluateCard';
import { SnapshotCard, ZipCard } from '../tools/SnapshotZipCards';
import { useTrackerData } from '../tracker/useTracker';

export function ToolsTab() {
  const { tracker } = useHelper();
  const { roster, submissions, rosterError } = useTrackerData();
  useEffect(() => {
    void tracker?.load();
  }, [tracker]);
  return (
    <section class="cah-panel cah-tools">
      {rosterError && <div class="cah-banner cah-banner-error">Could not load the contestant list: {rosterError}</div>}
      <div class="cah-columns">
        <div>
          <QuestionsCard />
          <AnnouncementsCard />
          {roster && <BulkMessageCard roster={roster} />}
        </div>
        <div>
          {roster && <BulkEditCard roster={roster} />}
          {roster && <ReevaluateCard roster={roster} submissions={submissions} />}
          <SnapshotCard />
          {roster && <ZipCard roster={roster} submissions={submissions} />}
          <ChecklistCard />
          <ConnectionCard />
        </div>
      </div>
    </section>
  );
}

function ConnectionCard() {
  const { client, connection } = useHelper();
  const [stats, setStats] = useState<QueueStats>(client.queue.stats);
  useEffect(() => client.queue.onChange(setStats), [client]);
  const offset = client.serverClockOffsetMs;
  const latency = client.latency();
  return (
    <div class="cah-card">
      <h3>Connection</h3>
      <dl class="cah-dl">
        <dt>AWS</dt>
        <dd>
          <code>{client.baseUrl}</code>
        </dd>
        <dt>Logged in as</dt>
        <dd>{connection.adminName ?? 'unknown'}</dd>
        <dt>Permission</dt>
        <dd>{PERMISSION_LABEL[connection.permission]}</dd>
        <dt>Contests</dt>
        <dd>{connection.contests.length}</dd>
        <dt>Server clock</dt>
        <dd>{offset === null ? 'unknown' : `${offset >= 0 ? '+' : ''}${(offset / 1000).toFixed(1)} s vs this computer`}</dd>
        <dt>Requests</dt>
        <dd>
          {stats.inFlight} running, {stats.pending} waiting{stats.paused ? ' (paused)' : ''}
        </dd>
        <dt>AWS speed</dt>
        <dd data-testid="aws-latency">
          {latency ? `median ${latency.p50} ms, 95% under ${latency.p95} ms, slowest ${latency.max} ms (last ${latency.count} requests)` : 'no requests yet'}
        </dd>
      </dl>
    </div>
  );
}
