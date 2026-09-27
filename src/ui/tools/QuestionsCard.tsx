import { useEffect, useState } from 'preact/hooks';
import type { Question } from '@/core/model';
import { parseQuestions } from '@/core/parsers';
import { formatDateTime } from '@/core/time';
import { QUICK_ANSWERS, type QuickAnswer, replyToQuestion } from '@/features/shortcuts/actions';
import { useHelper } from '../context';

export function QuestionsCard() {
  const { client, contest, can, visible } = useHelper();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!contest) return;
    client.getPage(`contest/${contest.id}/questions`).then(
      ({ doc }) => setQuestions(parseQuestions(doc)),
      (err: unknown) => setError(String(err)),
    );
  };
  useEffect(() => {
    if (!visible) return undefined;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [client, contest?.id, visible]);

  if (!contest) return null;
  const open = (questions ?? []).filter((q) => !q.answered && !q.ignored);
  const list = showAll ? (questions ?? []) : open;

  return (
    <div class="cah-card" data-testid="questions-card">
      <div class="cah-toolbar">
        <h3>
          Questions <span class={`cah-count ${open.length ? 'cah-count-hot' : ''}`}>{open.length} unanswered</span>
        </h3>
        <span class="cah-spacer" />
        <label class="cah-check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.currentTarget.checked)} /> Show answered
        </label>
        <button type="button" onClick={load}>
          Refresh
        </button>
      </div>
      {error && <p class="cah-error-text">{error}</p>}
      {questions === null && <p class="cah-muted">Loading…</p>}
      {questions && list.length === 0 && <p class="cah-muted">No {showAll ? '' : 'unanswered '}questions.</p>}
      {list.map((q) => (
        <QuestionItem key={q.id ?? `${q.username}-${q.timestamp}`} question={q} canReply={can('messaging')} onDone={load} />
      ))}
    </div>
  );
}

function QuestionItem({ question, canReply, onDone }: { question: Question; canReply: boolean; onDone: () => void }) {
  const { client, contest } = useHelper();
  const [answer, setAnswer] = useState<QuickAnswer>('other');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!contest) return null;
  return (
    <div class={`cah-question ${question.answered ? 'cah-answered' : ''}`} data-question={question.id ?? ''}>
      <div class="cah-muted cah-small">
        <strong>{question.username}</strong> {question.fullName && `(${question.fullName})`} · {formatDateTime(question.timestamp)}
      </div>
      <div class="cah-q-subject">{question.subject}</div>
      <div class="cah-q-text">{question.text}</div>
      {question.answered ? (
        <div class="cah-q-reply">
          Reply: {question.replySubject} {question.replyText}
        </div>
      ) : (
        canReply && (
          <div class="cah-toolbar">
            <select value={answer} onChange={(e) => setAnswer(e.currentTarget.value as QuickAnswer)} aria-label="Quick answer">
              {(Object.keys(QUICK_ANSWERS) as QuickAnswer[]).map((a) => (
                <option key={a} value={a}>
                  {QUICK_ANSWERS[a]}
                </option>
              ))}
            </select>
            {answer === 'other' && <input type="text" size={40} value={text} onInput={(e) => setText(e.currentTarget.value)} aria-label="Answer" placeholder="Your answer" />}
            <button
              type="button"
              class="cah-primary"
              disabled={busy || (answer === 'other' && !text.trim())}
              onClick={() => {
                setBusy(true);
                replyToQuestion(client, contest.id, question, answer, text).then(onDone, (err: unknown) => {
                  setError(String(err));
                  setBusy(false);
                });
              }}
            >
              Reply
            </button>
            {error && <span class="cah-error-text">{error}</span>}
          </div>
        )
      )}
    </div>
  );
}
