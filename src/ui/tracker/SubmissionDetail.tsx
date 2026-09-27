import { useEffect, useState } from 'preact/hooks';
import type { SubmissionDetail as Detail, SubmissionFile } from '@/core/model';
import { parseSubmissionPage } from '@/core/parsers';
import { formatDateTime, zoneLabel } from '@/core/time';
import { type ReevaluationLevel, fetchSource, reevaluateSubmission } from '@/features/tracker/actions';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useHelper } from '../context';
import { downloadText } from '../download';
import { fmtScore, scoreClass } from './useTracker';

interface Props {
  submissionId: number;
  onClose: () => void;
}

/** Testcase outcomes, compilation output and source, fetched on demand from /submission/{id}. */
export function SubmissionDetail({ submissionId, onClose }: Props) {
  const { client, can, contest } = useHelper();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ file: SubmissionFile; text: string } | null>(null);
  const [confirm, setConfirm] = useState<ReevaluationLevel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    client.getPage(`submission/${submissionId}`).then(
      ({ doc }) => {
        if (!live) return;
        setDetail(parseSubmissionPage(doc));
        const onclick = doc.querySelector('button[onclick*="dataset_id"]')?.getAttribute('onclick') ?? '';
        const m = /'dataset_id':\s*(\d+)/.exec(onclick);
        setDatasetId(m?.[1] ? Number(m[1]) : null);
      },
      (err: unknown) => live && setError(String(err)),
    );
    return () => {
      live = false;
    };
  }, [client, submissionId]);

  const showSource = (file: SubmissionFile) => {
    fetchSource(client, file.fileId).then(
      (text) => setSource({ file, text }),
      (err: unknown) => setError(String(err)),
    );
  };

  return (
    <div class="cah-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="cah-dialog cah-dialog-wide" role="dialog" aria-label={`Submission ${submissionId}`}>
        <div class="cah-toolbar">
          <h2>Submission #{submissionId}</h2>
          <span class="cah-spacer" />
          <a href={client.url(`submission/${submissionId}`)} target="_blank" rel="noopener noreferrer">
            Open in AWS
          </a>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {error && <div class="cah-banner cah-banner-error">{error}</div>}
        {!detail && !error && <p class="cah-muted">Loading…</p>}
        {detail && (
          <>
            <dl class="cah-dl">
              <dt>User</dt>
              <dd>{detail.username}</dd>
              <dt>Task</dt>
              <dd>{detail.taskName}</dd>
              <dt>Time</dt>
              <dd>{formatDateTime(detail.timestamp)} ({zoneLabel()})</dd>
              <dt>Language</dt>
              <dd>{detail.language}</dd>
              <dt>Status</dt>
              <dd>
                <span class={`cah-chip ${scoreClass(detail)}`}>{detail.statusText}</span>
                {detail.official ? '' : ' (unofficial)'}
              </dd>
              <dt>Files</dt>
              <dd>
                {detail.files.map((f) => (
                  <span key={f.fileId} class="cah-file">
                    {f.name}{' '}
                    <button type="button" onClick={() => showSource(f)}>
                      Show
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() =>
                        void fetchSource(client, f.fileId).then((t) =>
                          downloadText(`${detail.username}-${submissionId}-${f.name}`, t, 'text/plain;charset=utf-8'),
                        )
                      }
                    >
                      Download
                    </button>
                  </span>
                ))}
              </dd>
            </dl>
            {can('all') && datasetId !== null && (
              <div class="cah-toolbar">
                <span class="cah-muted">Re-evaluate this submission:</span>
                <button type="button" onClick={() => setConfirm('compilation')}>
                  Recompile
                </button>
                <button type="button" onClick={() => setConfirm('evaluation')}>
                  Re-evaluate
                </button>
                {notice && <span class="cah-ok-text">{notice}</span>}
              </div>
            )}
            {detail.testcases.length > 0 && (
              <div class="cah-table-wrap">
                <table class="cah-table" data-testid="testcases">
                  <thead>
                    <tr>
                      <th class="cah-num">#</th>
                      <th>Outcome</th>
                      <th>Details</th>
                      <th>Resources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.testcases.map((t) => (
                      <tr key={t.index}>
                        <td class="cah-num">{t.index}</td>
                        <td>
                          <span class={`cah-chip cah-v-${t.verdict}`}>{fmtScore(Number(t.outcome))}</span>
                        </td>
                        <td>{t.details}</td>
                        <td class="cah-muted">{t.resources}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h3>Compilation: {detail.compilationOutcome || '—'}</h3>
            {(detail.compilationStdout.trim() || detail.compilationStderr.trim()) && (
              <pre class="cah-pre">{`${detail.compilationStdout}\n${detail.compilationStderr}`.trim()}</pre>
            )}
            {source && (
              <>
                <h3>{source.file.name}</h3>
                <pre class="cah-pre cah-source">{source.text}</pre>
              </>
            )}
          </>
        )}
      </div>
      {confirm && detail && datasetId !== null && (
        <ConfirmDialog
          title={confirm === 'compilation' ? 'Recompile this submission?' : 'Re-evaluate this submission?'}
          confirmLabel={confirm === 'compilation' ? 'Recompile' : 'Re-evaluate'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const level = confirm;
            setConfirm(null);
            reevaluateSubmission(client, { contestId: contest?.id ?? detail.contestId, submissionId, datasetId }, level).then(
              () => setNotice('Sent. The status updates after the next sync.'),
              (err: unknown) => setError(String(err)),
            );
          }}
        >
          <p>
            Submission #{submissionId} by {detail.username} on {detail.taskName} goes back into the evaluation queue.
            Its score may change.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
