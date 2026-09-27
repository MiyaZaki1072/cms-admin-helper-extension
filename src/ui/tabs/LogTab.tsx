import { useEffect, useState } from 'preact/hooks';
import { type AuditEntry, auditToCsv, clearAudit, onAuditChanged, readAudit } from '@/core/audit';
import { formatDateTime } from '@/core/time';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { downloadText, fileStamp } from '../download';

export function LogTab() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    void readAudit().then(setEntries);
    return onAuditChanged(setEntries);
  }, []);

  if (entries === null) return <p class="cah-muted">Loading…</p>;
  const newestFirst = [...entries].reverse();

  return (
    <section class="cah-panel">
      <div class="cah-toolbar">
        <h2>Audit log</h2>
        <span class="cah-muted">{entries.length} entries, kept in this browser only</span>
        <span class="cah-spacer" />
        <button type="button" disabled={entries.length === 0} onClick={() => downloadText(`cms-helper-audit-${fileStamp()}.csv`, auditToCsv(entries))}>
          Export CSV
        </button>
        <button type="button" disabled={entries.length === 0} onClick={() => setConfirmClear(true)}>
          Clear log…
        </button>
      </div>
      {entries.length === 0 ? (
        <p class="cah-muted">No actions yet. Every change the helper makes in CMS is recorded here.</p>
      ) : (
        <div class="cah-table-wrap">
          <table class="cah-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Contest</th>
                <th>Targets</th>
                <th>Result</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((e, i) => (
                <tr key={`${e.time}-${i}`}>
                  <td class="cah-nowrap">{formatDateTime(e.time)}</td>
                  <td>{e.action}</td>
                  <td>{e.contestId ?? ''}</td>
                  <td class="cah-targets" title={e.targets.join(', ')}>
                    {e.targets.length > 5 ? `${e.targets.slice(0, 5).join(', ')} +${e.targets.length - 5} more` : e.targets.join(', ')}
                  </td>
                  <td>
                    <span class={`cah-result cah-result-${e.result}`}>{e.result}</span>
                  </td>
                  <td>{e.details ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear the audit log?"
          confirmWord="CLEAR"
          confirmLabel="Clear log"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            void clearAudit();
          }}
        >
          <p>
            This deletes all {entries.length} entries from this browser. Export them first if you need a record. CMS is
            not changed.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
