import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

interface Props {
  title: string;
  /** The preview: exactly what will happen, to whom. */
  children: ComponentChildren;
  /**
   * Word the admin must type to confirm, e.g. "REMOVE". Required for
   * destructive actions; omit for a plain confirm.
   */
  confirmWord?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation dialog; with `confirmWord` the admin has to type it first. */
export function ConfirmDialog({ title, children, confirmWord, confirmLabel, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const ok = confirmWord === undefined || typed.trim() === confirmWord;
  return (
    <div class="cah-dialog-backdrop" role="presentation">
      <div class="cah-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div class="cah-dialog-body">{children}</div>
        {confirmWord !== undefined && (
          <label class="cah-confirm-label">
            <span>
              Type <code>{confirmWord}</code> to confirm
            </span>
            <input
              type="text"
              value={typed}
              autoFocus
              onInput={(e) => setTyped(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ok) onConfirm();
              }}
              aria-label={`Type ${confirmWord} to confirm`}
            />
          </label>
        )}
        <div class="cah-dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="cah-danger" disabled={!ok} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
