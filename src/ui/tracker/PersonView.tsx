import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Participation, Submission } from '@/core/model';
import { formatDateTime, zoneLabel } from '@/core/time';
import { type ReevaluationLevel, fetchParticipation, reevaluateParticipation } from '@/features/tracker/actions';
import { type ChangeFilter, type Contestant, matchesChange, scoreDeltas, summarizePerson } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { useHelper } from '../context';
import { MessageDialog } from './MessageDialog';
import { SubmissionList } from './SubmissionList';
import { Timeline } from './Timeline';
import { bestClass, fmtScore } from './useTracker';

interface Props {
  userId: number;
  roster: Roster;
  submissions: readonly Submission[];
}

const fmt = (ms: number | null) => (ms === null ? '–' : formatDateTime(ms));

export function PersonView({ userId, roster, submissions }: Props) {
  const { client, contest, can } = useHelper();
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [partError, setPartError] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<number | null>(null);
  const [change, setChange] = useState<ChangeFilter>('any');
  const [dialog, setDialog] = useState<'message' | ReevaluationLevel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contestant: Contestant = roster.contestants.find((c) => c.userId === userId) ?? {
    userId,
    username: submissions.find((s) => s.userId === userId)?.username ?? `#${userId}`,
    firstName: '',
    lastName: '',
    fullName: '',
    teamId: null,
    teamCode: '',
    teamName: '',
  };
  const own = useMemo(() => submissions.filter((s) => s.userId === userId).sort((a, b) => b.timestamp - a.timestamp), [submissions, userId]);
  const summary = useMemo(() => summarizePerson(userId, own, roster.tasks), [userId, own, roster.tasks]);
  const deltas = useMemo(() => scoreDeltas(own), [own]);
  const listed = useMemo(
    () => own.filter((s) => (taskFilter === null || s.taskId === taskFilter) && matchesChange(deltas.get(s.id), change)),
    [own, deltas, taskFilter, change],
  );

  useEffect(() => {
    if (!contest) return;
    setParticipation(null);
    setPartError(null);
    setTaskFilter(null);
    setChange('any');
    setNotice(null);
    let live = true;
    fetchParticipation(client, contest.id, userId).then(
      (p) => live && setParticipation(p),
      (err: unknown) => live && setPartError(String(err)),
    );
    return () => {
      live = false;
    };
  }, [client, contest?.id, userId]);

  if (!contest) return null;
  const times = roster.times;

  const report = () => [
    {
      name: 'Summary',
      rows: [
        ['Username', contestant.username],
        ['Name', contestant.fullName],
        ['Team', contestant.teamCode],
        ['Total', summary.total],
        ['Submissions', summary.submissions],
        ['Compile errors', summary.compileErrors],
        [`Last activity (${zoneLabel()})`, fmt(summary.lastActivity)],
        [],
        ['Task', 'Best', 'Max', 'Attempts', 'Compile errors', `Time of best (${zoneLabel()})`, `Last submission (${zoneLabel()})`],
        ...summary.tasks.map((t) => [t.taskName, t.best, t.maxScore, t.attempts, t.compileErrors, fmt(t.timeOfBest), fmt(t.lastAt)]),
      ],
    },
    {
      name: 'Submissions',
      rows: [
        [`Time (${zoneLabel()})`, 'Time (UTC)', 'Id', 'Task', 'Status', 'Score', 'Max', 'Official'],
        ...own.map((s) => [
          formatDateTime(s.timestamp),
          new Date(s.timestamp).toISOString(),
          s.id,
          s.taskName,
          s.statusText,
          s.score,
          s.maxScore,
          s.official ? 'yes' : 'no',
        ]),
      ],
    },
  ];

  return (
    <div class="cah-person" data-testid="person-view">
      <div class="cah-toolbar">
        <h2 data-testid="person-username">{contestant.username}</h2>
        <span>{contestant.fullName}</span>
        {contestant.teamCode && <span class="cah-chip">{contestant.teamCode}</span>}
        <span class="cah-spacer" />
        <button type="button" disabled={!can('messaging')} title={can('messaging') ? '' : 'Needs messaging permission'} onClick={() => setDialog('message')}>
          Message…
        </button>
        <button
          type="button"
          disabled={!can('all') || participation?.participationId == null}
          title={can('all') ? '' : 'Needs full access'}
          onClick={() => setDialog('evaluation')}
        >
          Re-evaluate…
        </button>
        <a class="cah-button-link" href={client.url(`contest/${contest.id}/user/${userId}/edit`)} target="_blank" rel="noopener noreferrer">
          Edit participation
        </a>
        <ExportMenu name={`${contestant.username}-report`} sheets={report} />
      </div>
      {notice && <p class="cah-ok-text">{notice}</p>}

      <dl class="cah-dl cah-dl-wide">
        <dt>Total</dt>
        <dd>
          <strong>{fmtScore(summary.total)}</strong>
        </dd>
        <dt>Submissions</dt>
        <dd>
          {summary.submissions} ({summary.compileErrors} compile errors)
        </dd>
        <dt>Last activity</dt>
        <dd>{fmt(summary.lastActivity)}</dd>
        <dt>Extra time</dt>
        <dd>{participation ? `${Math.round(participation.form.extraTime / 60)} min` : partError ? '?' : '…'}</dd>
        <dt>Delay</dt>
        <dd>{participation ? `${Math.round(participation.form.delayTime / 60)} min` : '…'}</dd>
        <dt>IP</dt>
        <dd>{participation ? participation.form.ip || 'any' : '…'}</dd>
        {participation && (participation.form.hidden || participation.form.unrestricted) && (
          <>
            <dt>Flags</dt>
            <dd>{[participation.form.hidden && 'hidden', participation.form.unrestricted && 'unrestricted'].filter(Boolean).join(', ')}</dd>
          </>
        )}
      </dl>
      {partError && <p class="cah-error-text">Could not load the participation: {partError}</p>}

      <div class="cah-table-wrap">
        <table class="cah-table" data-testid="person-matrix">
          <thead>
            <tr>
              <th>Task</th>
              <th class="cah-num">Best</th>
              <th class="cah-num">Attempts</th>
              <th class="cah-num">Compile errors</th>
              <th>Time of best</th>
              <th>Last submission</th>
            </tr>
          </thead>
          <tbody>
            {summary.tasks.map((t) => (
              <tr
                key={t.taskId}
                data-task={t.taskName}
                class={taskFilter === t.taskId ? 'cah-row-on cah-clickable' : 'cah-clickable'}
                onClick={() => setTaskFilter(taskFilter === t.taskId ? null : t.taskId)}
                title="Show only this task's submissions"
              >
                <td>{t.taskName}</td>
                <td class={`cah-num ${bestClass(t.best, t.maxScore)}`}>
                  {fmtScore(t.best)}
                  {t.maxScore !== null && <span class="cah-muted"> / {fmtScore(t.maxScore)}</span>}
                </td>
                <td class="cah-num">
                  {t.attempts}
                  {t.pending > 0 && <span class="cah-muted"> ({t.pending} pending)</span>}
                </td>
                <td class="cah-num">{t.compileErrors}</td>
                <td>{fmt(t.timeOfBest)}</td>
                <td>{fmt(t.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Timeline
        submissions={own}
        tasks={roster.tasks}
        start={times ? times.start * 1000 : null}
        end={times ? Math.min(times.stop * 1000, Math.max(Date.now(), times.start * 1000)) : null}
      />

      <div class="cah-toolbar">
        <h3>Submissions</h3>
        <div class="cah-pills" role="group" aria-label="Filter by task" data-testid="task-pills">
          <button type="button" class={taskFilter === null ? 'cah-pill cah-pill-on' : 'cah-pill'} aria-pressed={taskFilter === null} onClick={() => setTaskFilter(null)}>
            All <span class="cah-muted">{own.length}</span>
          </button>
          {summary.tasks.map((t) => (
            <button
              key={t.taskId}
              type="button"
              class={taskFilter === t.taskId ? 'cah-pill cah-pill-on' : 'cah-pill'}
              aria-pressed={taskFilter === t.taskId}
              onClick={() => setTaskFilter(t.taskId)}
            >
              {t.taskName} <span class="cah-muted">{t.attempts}</span>
            </button>
          ))}
        </div>
        <label>
          Change{' '}
          <select value={change} onChange={(e) => setChange(e.currentTarget.value as ChangeFilter)} aria-label="Change">
            <option value="any">Any</option>
            <option value="gained">Gained points</option>
            <option value="lost">Lost points</option>
            <option value="same">No change</option>
          </select>
        </label>
        <span class="cah-muted" data-testid="person-sub-count">
          {listed.length} of {own.length}
        </span>
      </div>
      <SubmissionList submissions={listed} all={own} />

      {dialog === 'message' && (
        <MessageDialog target={{ contestId: contest.id, userId, username: contestant.username }} onClose={() => setDialog(null)} />
      )}
      {(dialog === 'evaluation' || dialog === 'compilation') && participation?.participationId != null && (
        <ConfirmDialog
          title={`Re-evaluate ${contestant.username}?`}
          confirmWord={contestant.username}
          confirmLabel="Re-evaluate all"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            reevaluateParticipation(
              client,
              { contestId: contest.id, participationId: participation.participationId!, username: contestant.username },
              'evaluation',
            ).then(
              () => setNotice(`Re-evaluation of ${contestant.username} queued. Scores update after the next sync.`),
              (err: unknown) => setNotice(`Re-evaluation failed: ${String(err)}`),
            );
          }}
        >
          <p>
            All {summary.submissions} submissions of {contestant.username} in {contest.name} go back into the evaluation
            queue. Scores may change while contestants are working.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
