import { useState } from 'preact/hooks';
import { sendPrivateMessage } from '@/features/tracker/actions';
import { useHelper } from '../context';

interface Props {
  target: { contestId: number; userId: number; username: string };
  onClose: () => void;
}

export function MessageDialog({ target, onClose }: Props) {
  const { client } = useHelper();
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; message: string }>({ kind: 'idle' });

  const send = () => {
    setState({ kind: 'sending' });
    sendPrivateMessage(client, target, subject, text).then(
      () => setState({ kind: 'sent' }),
      (err: unknown) => setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
  };

  return (
    <div class="cah-dialog-backdrop">
      <div class="cah-dialog" role="dialog" aria-label={`Message ${target.username}`}>
        <h2>Private message to {target.username}</h2>
        {state.kind === 'sent' ? (
          <p class="cah-ok-text">Sent. {target.username} sees it on the contest site.</p>
        ) : (
          <>
            <label class="cah-field">
              Subject
              <input type="text" value={subject} onInput={(e) => setSubject(e.currentTarget.value)} />
            </label>
            <label class="cah-field">
              Text
              <textarea rows={5} value={text} onInput={(e) => setText(e.currentTarget.value)} />
            </label>
            {state.kind === 'error' && <div class="cah-banner cah-banner-error">{state.message}</div>}
          </>
        )}
        <div class="cah-dialog-actions">
          <button type="button" onClick={onClose}>
            {state.kind === 'sent' ? 'Close' : 'Cancel'}
          </button>
          {state.kind !== 'sent' && (
            <button type="button" class="cah-primary" disabled={!subject.trim() || state.kind === 'sending'} onClick={send}>
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
