import { useEffect, useMemo, useState } from 'preact/hooks';
import type { User } from '@/core/model';
import { parseContestUsers } from '@/core/parsers';
import { type BulkOutcome, bulkAddToContest, bulkRemoveFromContest, bulkResetPasswords } from '@/features/import/bulk';
import { guessContestUrl, openLoginCards } from '@/features/import/cards';
import { contestWrites } from '@/features/import/writes';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportMenu } from '../components/ExportMenu';
import { useHelper } from '../context';

type Action = 'add' | 'remove' | 'reset';

const preview = (users: readonly User[]) => {
  const names = users.map((u) => u.username);
  return names.length > 30 ? `${names.slice(0, 30).join(', ')} and ${names.length - 30} more` : names.join(', ');
};

export function ManageUsers() {
  const { client, contest, connection, can } = useHelper();
  const [users, setUsers] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [method, setMethod] = useState<'bcrypt' | 'plaintext'>('bcrypt');
  const [digits, setDigits] = useState(4);
  const [results, setResults] = useState<{ action: Action; rows: BulkOutcome[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!contest) return;
    client.getPage(`contest/${contest.id}/users`).then(
      ({ doc }) => setUsers(parseContestUsers(doc).participants),
      (err: unknown) => setError(String(err)),
    );
  };
  useEffect(() => {
    setSelected(new Set());
    setResults(null);
    reload();
  }, [client, contest?.id]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !q || u.username.toLowerCase().includes(q) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q));
  }, [users, query]);

  if (!contest) return null;
  const chosen = (users ?? []).filter((u) => selected.has(u.id));
  const others = connection.contests.filter((c) => c.id !== contest.id);
  const disabled = !can('all') || chosen.length === 0 || running;

  const run = async (a: Action) => {
    setAction(null);
    setRunning(true);
    setError(null);
    setResults(null);
    const targets = chosen.map((u) => ({ userId: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName }));
    try {
      let rows: BulkOutcome[];
      if (a === 'add') {
        const to = target ?? others[0]?.id;
        if (to === undefined) throw new Error('There is no other contest.');
        rows = await bulkAddToContest(contestWrites(client, to), to, targets);
      } else if (a === 'remove') {
        rows = await bulkRemoveFromContest(contestWrites(client, contest.id), contest.id, targets);
      } else {
        rows = await bulkResetPasswords(contestWrites(client, contest.id), contest.id, targets, method, digits);
      }
      setResults({ action: a, rows: rows.sort((x, y) => x.username.localeCompare(y.username)) });
      setSelected(new Set());
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div class="cah-card cah-wide-card" data-testid="manage-users">
      <h3>Manage users in {contest.name}</h3>
      <div class="cah-toolbar">
        <input type="search" placeholder="Filter" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Filter users" />
        <button type="button" onClick={() => setSelected(new Set([...selected, ...shown.map((u) => u.id)]))}>
          Select shown ({shown.length})
        </button>
        <button type="button" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
          Clear
        </button>
        <span class="cah-muted">{selected.size} selected</span>
        <span class="cah-spacer" />
        <button type="button" disabled={disabled || others.length === 0} onClick={() => setAction('add')}>
          Add to another contest…
        </button>
        <button type="button" disabled={disabled} onClick={() => setAction('reset')}>
          Reset passwords…
        </button>
        <button type="button" class="cah-danger" disabled={disabled} onClick={() => setAction('remove')}>
          Remove from contest…
        </button>
      </div>
      {running && <p class="cah-muted">Working…</p>}
      {error && <div class="cah-banner cah-banner-error">{error}</div>}
      {users === null ? (
        <p class="cah-muted">Loading…</p>
      ) : (
        <div class="cah-table-wrap cah-scroll-list">
          <table class="cah-table" data-testid="manage-list">
            <thead>
              <tr>
                <th />
                <th>Username</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} class="cah-clickable" data-username={u.username}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      aria-label={`Select ${u.username}`}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.currentTarget.checked) next.add(u.id);
                        else next.delete(u.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td>{u.username}</td>
                  <td>{`${u.firstName} ${u.lastName}`.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results && (
        <div data-testid="bulk-results">
          <div class="cah-toolbar">
            <strong>
              {results.rows.filter((r) => r.state === 'done').length} done, {results.rows.filter((r) => r.state === 'failed').length} failed,{' '}
              {results.rows.filter((r) => r.state === 'skipped').length} skipped
            </strong>
            <span class="cah-spacer" />
            <ExportMenu
              name={`${results.action}-results-${contest.name}`}
              label="Results"
              sheets={() => [
                {
                  name: 'Results',
                  rows: [['username', 'password', 'first_name', 'last_name', 'result', 'message'], ...results.rows.map((r) => [r.username, r.password, r.firstName, r.lastName, r.state, r.message])],
                },
              ]}
            />
            {results.action === 'reset' && (
              <button
                type="button"
                onClick={() =>
                  openLoginCards(
                    results.rows.filter((r) => r.password).map((r) => ({ username: r.username, password: r.password, fullName: `${r.firstName} ${r.lastName}`.trim() })),
                    { contestName: contest.description || contest.name, url: guessContestUrl(client.baseUrl, contest.name), perPage: 10 },
                  )
                }
              >
                Print login cards
              </button>
            )}
          </div>
          {results.action === 'reset' && <div class="cah-banner cah-banner-info">Save these passwords now: they are not stored anywhere.</div>}
          <div class="cah-table-wrap">
            <table class="cah-table">
              <tbody>
                {results.rows.map((r) => (
                  <tr key={r.userId} data-username={r.username} data-state={r.state}>
                    <td>{r.username}</td>
                    <td>{r.password ? <code>{r.password}</code> : ''}</td>
                    <td>{r.state}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {action === 'add' && (
        <ConfirmDialog title={`Add ${chosen.length} users to another contest?`} confirmLabel="Add" onCancel={() => setAction(null)} onConfirm={() => void run('add')}>
          <label class="cah-field">
            Contest
            <select value={target ?? others[0]?.id} onChange={(e) => setTarget(Number(e.currentTarget.value))} aria-label="Target contest">
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.description}
                </option>
              ))}
            </select>
          </label>
          <p>{preview(chosen)}</p>
          <p class="cah-muted">Users already in that contest are skipped.</p>
        </ConfirmDialog>
      )}
      {action === 'remove' && (
        <ConfirmDialog
          title={`Remove ${chosen.length} users from ${contest.name}?`}
          confirmWord="REMOVE"
          confirmLabel="Remove"
          onCancel={() => setAction(null)}
          onConfirm={() => void run('remove')}
        >
          <p>{preview(chosen)}</p>
          <p class="cah-error-text">
            Their participation in {contest.name} is deleted, including all their submissions, questions and messages in this contest.
            The user accounts stay.
          </p>
        </ConfirmDialog>
      )}
      {action === 'reset' && (
        <ConfirmDialog
          title={`Reset the passwords of ${chosen.length} users?`}
          confirmWord="RESET"
          confirmLabel="Reset passwords"
          onCancel={() => setAction(null)}
          onConfirm={() => void run('reset')}
        >
          <p>{preview(chosen)}</p>
          <div class="cah-toolbar">
            <label class="cah-check">
              <input type="radio" name="cah-reset-method" checked={method === 'bcrypt'} onChange={() => setMethod('bcrypt')} /> Hashed (bcrypt)
            </label>
            <label class="cah-check">
              <input type="radio" name="cah-reset-method" checked={method === 'plaintext'} onChange={() => setMethod('plaintext')} /> Plain text
            </label>
            <select value={digits} onChange={(e) => setDigits(Number(e.currentTarget.value))} aria-label="Reset password digits">
              {[3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  word + {d} digits
                </option>
              ))}
            </select>
          </div>
          <p class="cah-muted">Each user gets a new generated password. Their old password stops working at once.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
