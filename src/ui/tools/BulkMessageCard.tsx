import { useState } from 'preact/hooks';
import { type MessageOutcome, bulkMessage } from '@/features/shortcuts/bulk';
import { PLACEHOLDERS, fillPlaceholders, unknownPlaceholders } from '@/features/shortcuts/templates';
import type { Contestant } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHelper } from '../context';
import { ContestantSelect } from './ContestantSelect';

export function BulkMessageCard({ roster }: { roster: Roster }) {
  const { client, contest, can } = useHelper();
  const [people, setPeople] = useState<Contestant[]>([]);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<MessageOutcome[] | null>(null);
  const [running, setRunning] = useState(false);

  if (!contest) return null;
  const unknown = unknownPlaceholders(`${subject} ${text}`);
  const first = people[0];
  const values = (c: Contestant) => ({ username: c.username, firstName: c.firstName, lastName: c.lastName, teamCode: c.teamCode });

  return (
    <div class="cah-card" data-testid="bulk-message-card">
      <h3>Private message to many</h3>
      <ContestantSelect roster={roster} onChange={setPeople} label="To" />
      <label class="cah-field">
        Subject
        <input type="text" value={subject} onInput={(e) => setSubject(e.currentTarget.value)} aria-label="Message subject" />
      </label>
      <label class="cah-field">
        Text
        <textarea rows={3} value={text} onInput={(e) => setText(e.currentTarget.value)} aria-label="Message text" />
      </label>
      <p class="cah-muted cah-small">Placeholders: {PLACEHOLDERS.join(' ')}</p>
      {unknown.length > 0 && <p class="cah-error-text">Unknown placeholder {unknown.join(', ')}</p>}
      {first && subject && (
        <p class="cah-muted cah-small">
          Preview for {first.username}: <strong>{fillPlaceholders(subject, values(first))}</strong> {fillPlaceholders(text, values(first))}
        </p>
      )}
      <div class="cah-toolbar">
        <button type="button" class="cah-primary" disabled={!can('messaging') || !subject.trim() || people.length === 0 || running || unknown.length > 0} onClick={() => setConfirm(true)}>
          Send to {people.length}
        </button>
        {results && (
          <strong data-testid="bulk-message-summary">
            {results.filter((r) => r.state === 'done').length} sent, {results.filter((r) => r.state === 'failed').length} failed
          </strong>
        )}
      </div>
      {results && results.some((r) => r.state === 'failed') && (
        <ul class="cah-error-text">
          {results
            .filter((r) => r.state === 'failed')
            .map((r) => (
              <li key={r.userId}>
                {r.username}: {r.message}
              </li>
            ))}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog
          title={`Send ${people.length} private messages?`}
          confirmLabel="Send"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            setRunning(true);
            setResults([]);
            void bulkMessage(
              client,
              contest.id,
              people.map((p) => ({ userId: p.userId, ...values(p) })),
              subject,
              text,
              { onRow: (o) => setResults((r) => [...(r ?? []), o]) },
            ).finally(() => setRunning(false));
          }}
        >
          <p>
            To: {people.slice(0, 40).map((p) => p.username).join(', ')}
            {people.length > 40 && ` and ${people.length - 40} more`}
          </p>
          {first && (
            <p>
              <strong>{fillPlaceholders(subject, values(first))}</strong>
              <br />
              {fillPlaceholders(text, values(first))}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
