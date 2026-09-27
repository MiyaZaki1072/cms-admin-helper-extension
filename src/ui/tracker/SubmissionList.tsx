import { useState } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { formatDateTime, zoneLabel } from '@/core/time';
import { useHelper } from '../context';
import { SubmissionDetail } from './SubmissionDetail';
import { scoreClass } from './useTracker';

interface Props {
  submissions: readonly Submission[];
  showUser?: boolean;
  /** Most rows to render (the rest are counted). */
  limit?: number;
  onUser?: (userId: number) => void;
}

export function SubmissionList({ submissions, showUser = false, limit = 500, onUser }: Props) {
  const { client } = useHelper();
  const [open, setOpen] = useState<number | null>(null);
  const shown = submissions.slice(0, limit);
  return (
    <>
      <div class="cah-table-wrap">
        <table class="cah-table" data-testid="submission-list">
          <thead>
            <tr>
              <th>Time ({zoneLabel()})</th>
              {showUser && <th>User</th>}
              <th>Task</th>
              <th>Result</th>
              <th>Official</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} data-submission={s.id}>
                <td class="cah-nowrap" title={`UTC ${new Date(s.timestamp).toISOString().replace('T', ' ').slice(0, 19)}`}>
                  {formatDateTime(s.timestamp)}
                </td>
                {showUser && (
                  <td>
                    {onUser ? (
                      <button type="button" class="cah-link" onClick={() => onUser(s.userId)}>
                        {s.username}
                      </button>
                    ) : (
                      s.username
                    )}
                  </td>
                )}
                <td>{s.taskName}</td>
                <td>
                  <span class={`cah-chip ${scoreClass(s)}`}>{s.statusText}</span>
                </td>
                <td>{s.official ? 'Yes' : 'No'}</td>
                <td class="cah-nowrap">
                  <button type="button" onClick={() => setOpen(s.id)}>
                    Details
                  </button>{' '}
                  <a href={client.url(`submission/${s.id}`)} target="_blank" rel="noopener noreferrer">
                    AWS
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {submissions.length > shown.length && (
        <p class="cah-muted">
          Showing the newest {shown.length} of {submissions.length}. Narrow the filters or export to see all.
        </p>
      )}
      {open !== null && <SubmissionDetail submissionId={open} onClose={() => setOpen(null)} />}
    </>
  );
}
