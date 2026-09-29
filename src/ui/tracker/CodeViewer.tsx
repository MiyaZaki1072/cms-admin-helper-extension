import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type DiffLine, diffLines, foldUnchanged, splitLines } from '@/core/diff';
import type { Submission, SubmissionFile } from '@/core/model';
import { formatDateTime, zoneLabel } from '@/core/time';
import { fetchSource, isViewableSource } from '@/features/tracker/actions';
import { useHelper } from '../context';
import { downloadText } from '../download';
import { SubmissionDetail } from './SubmissionDetail';
import { fmtScore, scoreClass } from './useTracker';

interface Props {
  /** Submission shown first. */
  submissionId: number;
  /** Submissions to step through: the viewer uses the ones by the same user on the same task. */
  submissions: readonly Submission[];
  /** Score change per submission id, from scoreDeltas(). */
  deltas: ReadonlyMap<number, number>;
  onClose: () => void;
}

type Loaded = { fileId: number | null; text?: string; error?: string };

/** Text of one submitted file, fetched (and cached) on demand. */
function useSource(fileId: number | null): Loaded {
  const { client } = useHelper();
  const [state, setState] = useState<Loaded>({ fileId: null });
  useEffect(() => {
    if (fileId === null) return;
    let live = true;
    fetchSource(client, fileId).then(
      (text) => live && setState({ fileId, text }),
      (err: unknown) => live && setState({ fileId, error: String(err) }),
    );
    return () => {
      live = false;
    };
  }, [client, fileId]);
  return state.fileId === fileId ? state : { fileId };
}

/** The file of `prev` to compare with `file`: same name, or the only file when both have one. */
function counterpart(prev: Submission | undefined, file: SubmissionFile | undefined, fileCount: number): SubmissionFile | undefined {
  if (!prev || !file) return undefined;
  return prev.files.find((f) => f.name === file.name) ?? (fileCount === 1 && prev.files.length === 1 ? prev.files[0] : undefined);
}

/** "+40" / "−20" / "±0" against the previous scored submission; "–" when there is none. */
export function DeltaChip({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return <span class="cah-muted">–</span>;
  const cls = delta > 0 ? 'cah-delta-up' : delta < 0 ? 'cah-delta-down' : 'cah-muted';
  const text = delta > 0 ? `+${fmtScore(delta)}` : delta < 0 ? `−${fmtScore(-delta)}` : '±0';
  return (
    <span class={cls} title="Compared with this contestant's previous scored submission on the task">
      {text}
    </span>
  );
}

/** A submission's source with line numbers, a diff against the previous one on the task, and ◀ ▶ through them. */
export function CodeViewer({ submissionId, submissions, deltas, onClose }: Props) {
  const { client } = useHelper();
  const [currentId, setCurrentId] = useState(submissionId);
  const [fileName, setFileName] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [details, setDetails] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const current = submissions.find((s) => s.id === currentId);
  const thread = useMemo(
    () =>
      current
        ? submissions
            .filter((s) => s.userId === current.userId && s.taskId === current.taskId)
            .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id)
        : [],
    [submissions, current?.userId, current?.taskId],
  );
  const index = thread.findIndex((s) => s.id === currentId);
  const prev = index > 0 ? thread[index - 1] : undefined;
  const next = index >= 0 ? thread[index + 1] : undefined;

  const file = current?.files.find((f) => f.name === fileName) ?? current?.files[0];
  const oldFile = counterpart(prev, file, current?.files.length ?? 0);
  const src = useSource(file?.fileId ?? null);
  const old = useSource(compare && oldFile ? oldFile.fileId : null);
  const srcOk = src.text !== undefined && isViewableSource(src.text);
  const oldOk = old.text !== undefined && isViewableSource(old.text);

  const diff = useMemo(
    () => (compare && srcOk && oldOk ? diffLines(old.text!, src.text!) : undefined),
    [compare, srcOk, oldOk, src.text, old.text],
  );

  useEffect(() => box.current?.focus(), []);
  useEffect(() => setShowAll(false), [currentId, file?.fileId, compare]);

  const go = (s: Submission | undefined) => s && setCurrentId(s.id);

  return (
    <div class="cah-dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class="cah-dialog cah-dialog-code"
        role="dialog"
        aria-label={`Code of submission ${currentId}`}
        data-testid="code-viewer"
        tabIndex={-1}
        ref={box}
        onKeyDown={(e) => {
          if (details || (e.target as Element).closest('input, select, textarea')) return;
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'ArrowLeft') go(prev);
          else if (e.key === 'ArrowRight') go(next);
        }}
      >
        <div class="cah-toolbar">
          <h2>{current ? `${current.username} · ${current.taskName}` : `Submission #${currentId}`}</h2>
          <span class="cah-spacer" />
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {!current && <p class="cah-error-text">This submission is no longer in the tracker.</p>}
        {current && (
          <>
            <div class="cah-toolbar">
              <button type="button" disabled={!prev} onClick={() => go(prev)} title="Previous submission on this task (←)">
                ◀ Previous
              </button>
              <span class="cah-muted" data-testid="code-position">
                {index + 1} of {thread.length}
              </span>
              <button type="button" disabled={!next} onClick={() => go(next)} title="Next submission on this task (→)">
                Next ▶
              </button>
              <span>
                #{current.id} · {formatDateTime(current.timestamp)} ({zoneLabel()})
              </span>
              <span class={`cah-chip ${scoreClass(current)}`}>{current.statusText}</span>
              <strong data-testid="code-delta">
                <DeltaChip delta={deltas.get(current.id)} />
              </strong>
              {!current.official && <span class="cah-muted">(unofficial)</span>}
            </div>
            <div class="cah-toolbar">
              {current.files.length > 1 &&
                current.files.map((f) => (
                  <button
                    key={f.fileId}
                    type="button"
                    class={f.fileId === file?.fileId ? 'cah-pill cah-pill-on' : 'cah-pill'}
                    onClick={() => setFileName(f.name)}
                  >
                    {f.name}
                  </button>
                ))}
              {current.files.length === 1 && file && <code>{file.name}</code>}
              <label class="cah-check" title={prev ? `Compare with #${prev.id}` : 'This is the first submission on the task'}>
                <input type="checkbox" checked={compare} disabled={!prev} onChange={(e) => setCompare(e.currentTarget.checked)} />
                Compare with previous
              </label>
              <span class="cah-spacer" />
              {file && src.text !== undefined && (
                <button
                  type="button"
                  onClick={() => downloadText(`${current.username}-${current.id}-${file.name}`, src.text!, 'text/plain;charset=utf-8')}
                >
                  Download
                </button>
              )}
              <button type="button" onClick={() => setDetails(true)}>
                Details
              </button>
              <a href={client.url(`submission/${current.id}`)} target="_blank" rel="noopener noreferrer">
                Open in AWS
              </a>
            </div>

            {current.files.length === 0 && <p class="cah-muted">This submission has no files.</p>}
            {src.error && <div class="cah-banner cah-banner-error">Could not load the file: {src.error}</div>}
            {file && src.text === undefined && !src.error && <p class="cah-muted">Loading…</p>}
            {src.text !== undefined && !srcOk && <p class="cah-muted">This file is too large or not plain text. Use Download to open it.</p>}

            {srcOk && !compare && <Source text={src.text!} />}

            {srcOk && compare && prev && (
              <>
                {!oldFile && <p class="cah-muted">The previous submission (#{prev.id}) has no file called {file?.name}.</p>}
                {old.error && <div class="cah-banner cah-banner-error">Could not load the previous file: {old.error}</div>}
                {oldFile && old.text === undefined && !old.error && <p class="cah-muted">Loading the previous version…</p>}
                {old.text !== undefined && !oldOk && <p class="cah-muted">The previous version is too large or not plain text to compare.</p>}
                {diff === null && <p class="cah-muted">The two versions differ too much to compare line by line.</p>}
                {diff && <Diff lines={diff} prevId={prev.id} showAll={showAll} onShowAll={() => setShowAll(true)} />}
              </>
            )}
          </>
        )}
      </div>
      {details && current && <SubmissionDetail submissionId={current.id} onClose={() => setDetails(false)} />}
    </div>
  );
}

function Source({ text }: { text: string }) {
  const lines = splitLines(text);
  return (
    <div class="cah-code" data-testid="code-source">
      {lines.length === 0 && <p class="cah-muted">The file is empty.</p>}
      {lines.map((line, k) => (
        <div key={k} class="cah-code-line">
          <span class="cah-code-no">{k + 1}</span>
          <span class="cah-code-text">{line}</span>
        </div>
      ))}
    </div>
  );
}

function Diff({ lines, prevId, showAll, onShowAll }: { lines: DiffLine[]; prevId: number; showAll: boolean; onShowAll: () => void }) {
  const added = lines.filter((l) => l.kind === 'added').length;
  const removed = lines.filter((l) => l.kind === 'removed').length;
  const rows = showAll ? lines : foldUnchanged(lines);
  return (
    <>
      <p data-testid="code-diff-summary">
        Compared with #{prevId}: <span class="cah-delta-up">+{added}</span> <span class="cah-delta-down">−{removed}</span> lines
        {added === 0 && removed === 0 && ' (no changes)'}
      </p>
      <div class="cah-code" data-testid="code-diff">
        {rows.map((row, k) =>
          row.kind === 'skip' ? (
            <button key={k} type="button" class="cah-code-skip" onClick={onShowAll}>
              … {row.count} unchanged {row.count === 1 ? 'line' : 'lines'} (show all)
            </button>
          ) : (
            <div key={k} class={`cah-code-line cah-code-${row.kind}`}>
              <span class="cah-code-no">{row.oldNo ?? ''}</span>
              <span class="cah-code-no">{row.newNo ?? ''}</span>
              <span class="cah-code-mark">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ''}</span>
              <span class="cah-code-text">{row.text}</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}
