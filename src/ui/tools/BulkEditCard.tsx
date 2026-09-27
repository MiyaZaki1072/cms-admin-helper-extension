import { useState } from 'preact/hooks';
import { type EditOutcome, type ParticipationChange, bulkEditParticipations, parseSeatMap } from '@/features/shortcuts/bulk';
import type { Contestant } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { useHelper } from '../context';
import { ContestantSelect } from './ContestantSelect';

type Kind = 'extra' | 'hidden' | 'unrestricted' | 'ip';

export function BulkEditCard({ roster }: { roster: Roster }) {
  const { client, contest, can } = useHelper();
  const [kind, setKind] = useState<Kind>('extra');
  const [minutes, setMinutes] = useState('10');
  const [flag, setFlag] = useState(true);
  const [seatMap, setSeatMap] = useState('');
  const [people, setPeople] = useState<Contestant[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EditOutcome[] | null>(null);

  if (!contest) return null;
  const seats = kind === 'ip' ? parseSeatMap(seatMap) : [];
  const byName = new Map(roster.contestants.map((c) => [c.username, c]));
  const seatTargets = seats.filter((s) => !s.error && byName.has(s.username));
  const seatProblems = seats.filter((s) => s.error || !byName.has(s.username));
  const delta = Math.round(Number(minutes) * 60);

  const targets = kind === 'ip' ? seatTargets.map((s) => byName.get(s.username)!) : people;
  const valid = targets.length > 0 && (kind !== 'extra' || (Number.isFinite(delta) && delta !== 0));
  const describe =
    kind === 'extra'
      ? `${delta > 0 ? 'Add' : 'Remove'} ${Math.abs(delta / 60)} minutes of extra time`
      : kind === 'ip'
        ? 'Set IP addresses from the seat map'
        : `${flag ? 'Set' : 'Clear'} "${kind}"`;

  const apply = () => {
    setConfirm(false);
    setRunning(true);
    setResults([]);
    const seatIp = new Map(seatTargets.map((s) => [s.username, s.ip]));
    const change = (t: { username: string }): ParticipationChange =>
      kind === 'extra' ? { extraTimeDelta: delta } : kind === 'ip' ? { ip: seatIp.get(t.username) ?? '' } : { [kind]: flag };
    void bulkEditParticipations(
      client,
      contest.id,
      targets.map((t) => ({ userId: t.userId, username: t.username })),
      change,
      { action: kind === 'extra' ? 'Bulk extra time' : kind === 'ip' ? 'Bulk IP lock' : `Bulk ${kind}`, details: describe, onRow: (o) => setResults((r) => [...(r ?? []), o]) },
    ).finally(() => setRunning(false));
  };

  return (
    <div class="cah-card" data-testid="bulk-edit-card">
      <h3>Extra time, hide, IP lock</h3>
      <div class="cah-toolbar">
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as Kind)} aria-label="Change">
          <option value="extra">Extra time</option>
          <option value="hidden">Hidden</option>
          <option value="unrestricted">Unrestricted</option>
          <option value="ip">IP lock from seat map</option>
        </select>
        {kind === 'extra' && (
          <label>
            + <input type="number" value={minutes} size={4} onInput={(e) => setMinutes(e.currentTarget.value)} aria-label="Minutes" /> minutes
          </label>
        )}
        {(kind === 'hidden' || kind === 'unrestricted') && (
          <select value={flag ? 'on' : 'off'} onChange={(e) => setFlag(e.currentTarget.value === 'on')} aria-label="Flag value">
            <option value="on">Yes</option>
            <option value="off">No</option>
          </select>
        )}
      </div>
      {kind === 'ip' ? (
        <>
          <textarea
            rows={4}
            class="cah-paste"
            placeholder={'username,ip\nstu001,10.0.0.11\nstu002,10.0.0.12'}
            value={seatMap}
            onInput={(e) => setSeatMap(e.currentTarget.value)}
            aria-label="Seat map"
          />
          {seatProblems.length > 0 && (
            <ul class="cah-error-text">
              {seatProblems.map((s) => (
                <li key={s.line}>
                  Line {s.line}: {s.error ?? `${s.username} is not in this contest`}
                </li>
              ))}
            </ul>
          )}
          <p class="cah-muted">{seatTargets.length} contestants will get an IP.</p>
        </>
      ) : (
        <ContestantSelect roster={roster} onChange={setPeople} />
      )}
      <div class="cah-toolbar">
        <button type="button" class="cah-primary" disabled={!can('all') || !valid || running} onClick={() => setConfirm(true)}>
          Apply to {targets.length}
        </button>
        {running && <span class="cah-muted">Working… {results?.length ?? 0}/{targets.length}</span>}
      </div>
      {results && results.length > 0 && (
        <>
          <div class="cah-toolbar">
            <strong data-testid="bulk-edit-summary">
              {results.filter((r) => r.state === 'done').length} done, {results.filter((r) => r.state === 'failed').length} failed
            </strong>
            <span class="cah-spacer" />
            <ExportMenu
              name="bulk-change"
              label="Results"
              sheets={() => [{ name: 'Results', rows: [['username', 'result', 'before', 'after', 'message'], ...results.map((r) => [r.username, r.state, r.before, r.after, r.message])] }]}
            />
          </div>
          <div class="cah-table-wrap cah-scroll-list">
            <table class="cah-table" data-testid="bulk-edit-results">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.userId} data-username={r.username} data-state={r.state}>
                    <td>{r.username}</td>
                    <td>{r.before}</td>
                    <td>{r.after}</td>
                    <td>{r.state === 'done' ? 'Done' : r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirm && (
        <ConfirmDialog title={`${describe}?`} confirmLabel="Apply" onCancel={() => setConfirm(false)} onConfirm={apply}>
          <p>
            {describe} for {targets.length} contestant(s) in {contest.name}:
          </p>
          <p class="cah-muted">
            {targets
              .slice(0, 40)
              .map((t) => t.username)
              .join(', ')}
            {targets.length > 40 && ` and ${targets.length - 40} more`}
          </p>
          <p class="cah-muted">Each participation is read first and only this field changes; everything else is sent back as it was.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
