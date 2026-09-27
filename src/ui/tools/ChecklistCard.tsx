import { useState } from 'preact/hooks';
import { parseContestForm, parseContestTasks, parseContestUsers, parseUserPage } from '@/core/parsers';
import { runPool } from '@/features/import/runner';
import { type CheckItem, contestChecks } from '@/features/shortcuts/checklist';
import { useHelper } from '../context';

const ICON: Record<CheckItem['level'], string> = { ok: '✓', warn: '!', error: '✗' };

export function ChecklistCard() {
  const { client, contest } = useHelper();
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [users, setUsers] = useState<Array<{ id: number; username: string }>>([]);
  const [noPassword, setNoPassword] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!contest) return null;

  const run = async () => {
    setError(null);
    setProgress('Reading the contest…');
    try {
      const [c, t, u] = await Promise.all([
        client.getPage(`contest/${contest.id}`),
        client.getPage(`contest/${contest.id}/tasks`),
        client.getPage(`contest/${contest.id}/users`),
      ]);
      const participants = parseContestUsers(u.doc).participants;
      setUsers(participants.map((p) => ({ id: p.id, username: p.username })));
      setItems(contestChecks({ settings: parseContestForm(c.doc), taskCount: parseContestTasks(t.doc).length, participantCount: participants.length, now: Date.now() }));
    } catch (err) {
      setError(String(err));
    } finally {
      setProgress(null);
    }
  };

  const checkPasswords = async () => {
    const empty: string[] = [];
    let done = 0;
    setProgress(`Checking passwords 0/${users.length}`);
    await runPool(users, 2, async (u) => {
      try {
        const page = parseUserPage((await client.getPage(`user/${u.id}`)).doc);
        if (page.method === 'plaintext' && !page.password) empty.push(u.username);
      } catch {
        empty.push(`${u.username} (could not read)`);
      }
      setProgress(`Checking passwords ${++done}/${users.length}`);
    });
    setNoPassword(empty.sort());
    setProgress(null);
  };

  return (
    <div class="cah-card" data-testid="checklist-card">
      <h3>Pre-contest checklist</h3>
      <div class="cah-toolbar">
        <button type="button" onClick={() => void run()} disabled={progress !== null}>
          Run checks
        </button>
        {items && users.length > 0 && (
          <button type="button" onClick={() => void checkPasswords()} disabled={progress !== null}>
            Check user passwords ({users.length} requests)
          </button>
        )}
        {progress && <span class="cah-muted">{progress}</span>}
      </div>
      {error && <p class="cah-error-text">{error}</p>}
      {items && (
        <ul class="cah-checklist">
          {items.map((i) => (
            <li key={i.text} class={`cah-check-${i.level}`}>
              <span aria-hidden="true">{ICON[i.level]}</span> {i.text}
            </li>
          ))}
          {noPassword !== null && (
            <li class={noPassword.length ? 'cah-check-warn' : 'cah-check-ok'}>
              <span aria-hidden="true">{noPassword.length ? '!' : '✓'}</span>{' '}
              {noPassword.length ? `Users without a password: ${noPassword.join(', ')}` : 'Every user has a password.'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
