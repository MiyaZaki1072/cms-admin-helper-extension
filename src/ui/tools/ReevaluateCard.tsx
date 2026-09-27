import { useMemo, useState } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { type ReevalLevel, reevaluateContest, reevaluateTask } from '@/features/shortcuts/actions';
import type { Roster } from '@/features/tracker/roster';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHelper } from '../context';

export function ReevaluateCard({ roster, submissions }: { roster: Roster; submissions: readonly Submission[] }) {
  const { client, contest, can } = useHelper();
  const [taskId, setTaskId] = useState<number | null>(roster.tasks[0]?.id ?? null);
  const [confirm, setConfirm] = useState<{ scope: 'task' | 'contest'; level: ReevalLevel } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // The active dataset of a task, as seen on its submissions' re-evaluate buttons.
  const datasets = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of submissions) if (s.datasetId !== null && !map.has(s.taskId)) map.set(s.taskId, s.datasetId);
    return map;
  }, [submissions]);

  if (!contest) return null;
  const task = roster.tasks.find((t) => t.id === taskId);
  const datasetId = taskId === null ? undefined : datasets.get(taskId);
  const count = (scope: 'task' | 'contest') => (scope === 'task' ? submissions.filter((s) => s.taskId === taskId).length : submissions.length);

  const run = () => {
    if (!confirm) return;
    const { scope, level } = confirm;
    setConfirm(null);
    const job =
      scope === 'task' && task && datasetId !== undefined
        ? reevaluateTask(client, contest.id, { name: task.name, datasetId }, level)
        : reevaluateContest(client, contest.id, level);
    job.then(
      () => setNotice({ ok: true, text: 'Queued. Watch the status bar; scores update as evaluation finishes.' }),
      (err: unknown) => setNotice({ ok: false, text: String(err) }),
    );
  };

  return (
    <div class="cah-card" data-testid="reevaluate-card">
      <h3>Re-evaluate</h3>
      <p class="cah-muted cah-small">For one person, use the tracker's person view.</p>
      <div class="cah-toolbar">
        <select value={taskId ?? ''} onChange={(e) => setTaskId(Number(e.currentTarget.value))} aria-label="Task to re-evaluate">
          {roster.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!can('all') || datasetId === undefined} onClick={() => setConfirm({ scope: 'task', level: 'compilation' })}>
          Recompile task
        </button>
        <button type="button" disabled={!can('all') || datasetId === undefined} onClick={() => setConfirm({ scope: 'task', level: 'evaluation' })}>
          Re-evaluate task
        </button>
      </div>
      {datasetId === undefined && <p class="cah-muted cah-small">Sync the tracker first (no submissions of this task are indexed).</p>}
      <div class="cah-toolbar">
        <button type="button" class="cah-danger" disabled={!can('all')} onClick={() => setConfirm({ scope: 'contest', level: 'evaluation' })}>
          Re-evaluate the whole contest…
        </button>
      </div>
      {notice && <p class={notice.ok ? 'cah-ok-text' : 'cah-error-text'}>{notice.text}</p>}
      {confirm && (
        <ConfirmDialog
          title={confirm.scope === 'task' ? `${confirm.level === 'compilation' ? 'Recompile' : 'Re-evaluate'} task ${task?.name}?` : `Re-evaluate all of ${contest.name}?`}
          confirmWord={confirm.scope === 'contest' ? contest.name : 'REEVALUATE'}
          confirmLabel="Queue"
          onCancel={() => setConfirm(null)}
          onConfirm={run}
        >
          <p>
            About {count(confirm.scope)} submissions go back into the evaluation queue. During a contest this slows down feedback for
            everyone until the queue drains.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
