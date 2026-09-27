import { useEffect, useRef, useState } from 'preact/hooks';
import { logAudit } from '@/core/audit';
import { guessContestUrl, openLoginCards } from '@/features/import/cards';
import { type ImportOptions, type ImportPlan, loadServerState, planImport } from '@/features/import/plan';
import { type RowOutcome, type RowState, runImport, summarize } from '@/features/import/runner';
import { contestWrites } from '@/features/import/writes';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { useHelper } from '../context';

interface Props {
  plan: ImportPlan;
  options: ImportOptions;
}

const STATE_LABEL: Record<RowState, string> = {
  waiting: 'Waiting',
  running: 'Running…',
  done: 'Done',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Not run',
};

export function RunPanel({ plan, options }: Props) {
  const { client, contest, can } = useHelper();
  const [outcomes, setOutcomes] = useState<Map<number, RowOutcome>>(new Map());
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState('');
  const [perPage, setPerPage] = useState<8 | 10>(10);
  const controller = useRef<AbortController | null>(null);
  const passwords = useRef(new Map<number, string>());

  useEffect(() => {
    setOutcomes(new Map());
    passwords.current = new Map();
  }, [plan]);

  useEffect(() => {
    if (contest) setCardUrl(guessContestUrl(client.baseUrl, contest.name));
  }, [client, contest?.id]);

  if (!contest) return null;
  const todo = plan.counts.new + plan.counts.add;
  const list = [...outcomes.values()].sort((a, b) => a.line - b.line);
  const counts = summarize(list);
  const finished = list.length > 0 && !running;
  const failedRetryable = list.filter((o) => o.state === 'failed' && o.planned !== 'error');

  const execute = async (runPlan: ImportPlan) => {
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setError(null);
    try {
      const result = await runImport(runPlan, contestWrites(client, contest.id, abort.signal), {
        method: options.method,
        signal: abort.signal,
        onPhase: setPhase,
        onRow: (o) => {
          // A retried row keeps the password its user was created with.
          if (o.password) passwords.current.set(o.line, o.password);
          else if (passwords.current.has(o.line)) o.password = passwords.current.get(o.line)!;
          setOutcomes((prev) => new Map(prev).set(o.line, o));
        },
      });
      const c = summarize(result);
      await logAudit({
        action: 'Bulk import',
        contestId: contest.id,
        targets: result.filter((o) => o.state === 'done').map((o) => o.username),
        result: c.failed === 0 && c.cancelled === 0 ? 'ok' : c.done > 0 ? 'partial' : abort.signal.aborted ? 'cancelled' : 'failed',
        details: `${c.done} done, ${c.failed} failed, ${c.skipped} skipped, ${c.cancelled} not run`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      client.queue.resume();
      setPaused(false);
      setRunning(false);
      setPhase('');
    }
  };

  const retry = async () => {
    const lines = new Set(failedRetryable.map((o) => o.line));
    try {
      const server = await loadServerState(client, contest.id);
      const again = planImport(
        plan.rows.filter((r) => lines.has(r.line)),
        server,
        options,
      );
      // Users created in the first run keep their password.
      for (const row of again.rows) {
        const pw = passwords.current.get(row.line);
        if (pw && row.status === 'new') row.password = pw;
      }
      await execute(again);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const withPassword = list.filter((o) => o.password && (o.state === 'done' || o.state === 'skipped' || o.userId !== null));

  return (
    <div class="cah-card cah-wide-card" data-testid="import-run">
      <h3>5. Run</h3>
      {!can('all') && <p class="cah-error-text">Importing needs an admin with full access.</p>}
      <div class="cah-toolbar">
        <button
          type="button"
          class="cah-primary"
          disabled={!can('all') || running || todo === 0 || outcomes.size > 0}
          onClick={() => setConfirm(true)}
        >
          Import {todo} {todo === 1 ? 'user' : 'users'}
        </button>
        {running && (
          <>
            <button
              type="button"
              onClick={() => {
                if (paused) client.queue.resume();
                else client.queue.pause();
                setPaused(!paused);
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" onClick={() => controller.current?.abort()}>
              Cancel
            </button>
          </>
        )}
        {finished && failedRetryable.length > 0 && (
          <button type="button" onClick={() => void retry()}>
            Retry {failedRetryable.length} failed {failedRetryable.length === 1 ? 'row' : 'rows'}
          </button>
        )}
        {todo === 0 && outcomes.size === 0 && <span class="cah-muted">Nothing to do: every row is already in the contest or has an error.</span>}
      </div>
      {error && <div class="cah-banner cah-banner-error">{error}</div>}
      {list.length > 0 && (
        <>
          <div class="cah-progress">
            <progress max={todo || 1} value={counts.done + counts.failed - plan.counts.error + counts.cancelled} />
            <span data-testid="import-summary">
              {counts.done} done, {counts.failed} failed, {counts.skipped} skipped
              {counts.cancelled > 0 && `, ${counts.cancelled} not run`}
              {paused ? ' (paused)' : phase ? ` — ${phase}` : ''}
            </span>
          </div>
          {finished && withPassword.length > 0 && (
            <div class="cah-banner cah-banner-info">
              Save the results now: the passwords of new users are not stored anywhere and cannot be shown again
              {options.method === 'bcrypt' ? ' (bcrypt)' : ''}.
            </div>
          )}
          <div class="cah-toolbar">
            <ExportMenu
              name={`import-results-${contest.name}`}
              label="Results"
              sheets={() => [
                {
                  name: 'Import results',
                  rows: [
                    ['username', 'password', 'first_name', 'last_name', 'team', 'result', 'message'],
                    ...list.map((o) => [o.username, o.password, o.firstName, o.lastName, o.team, o.state, o.message]),
                  ],
                },
              ]}
            />
            <span class="cah-spacer" />
            <label>
              Contest site <input type="text" size={32} value={cardUrl} onInput={(e) => setCardUrl(e.currentTarget.value)} aria-label="Contest site address" />
            </label>
            <select value={perPage} onChange={(e) => setPerPage(Number(e.currentTarget.value) as 8 | 10)} aria-label="Cards per page">
              <option value={10}>10 per page</option>
              <option value={8}>8 per page</option>
            </select>
            <button
              type="button"
              disabled={withPassword.length === 0}
              onClick={() => {
                const ok = openLoginCards(
                  withPassword.map((o) => ({ username: o.username, password: o.password, fullName: `${o.firstName} ${o.lastName}`.trim() })),
                  { contestName: contest.description || contest.name, url: cardUrl, perPage },
                );
                if (!ok) setError('The browser blocked the new window. Allow pop-ups for AWS and try again.');
              }}
            >
              Print login cards ({withPassword.length})
            </button>
          </div>
          <div class="cah-table-wrap">
            <table class="cah-table" data-testid="import-results">
              <thead>
                <tr>
                  <th class="cah-num">Line</th>
                  <th>Username</th>
                  <th>Password</th>
                  <th>Result</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.line} data-line={o.line} data-state={o.state}>
                    <td class="cah-num">{o.line}</td>
                    <td>{o.username}</td>
                    <td>{o.password ? <code>{o.password}</code> : ''}</td>
                    <td>
                      <span class={`cah-chip cah-rs-${o.state}`}>{STATE_LABEL[o.state]}</span>
                    </td>
                    <td class="cah-notes">{o.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Import into ${contest.name}?`}
          confirmLabel="Start import"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void execute(plan);
          }}
        >
          <ul>
            {plan.newTeams.length > 0 && <li>Create {plan.newTeams.length} team(s): {plan.newTeams.join(', ')}</li>}
            {plan.counts.new > 0 && <li>Create {plan.counts.new} new user(s) and add them to {contest.name}</li>}
            {plan.counts.add > 0 && <li>Add {plan.counts.add} existing user(s) to {contest.name}</li>}
            {plan.counts.skip > 0 && <li>Skip {plan.counts.skip} already in the contest</li>}
            {plan.counts.error > 0 && <li>Skip {plan.counts.error} row(s) with errors</li>}
          </ul>
          <p class="cah-muted">
            About {Math.ceil((todo * 4) / 4 / 60) || 1} minute(s): up to 4 requests per second so AWS stays responsive. You can pause or
            cancel.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
