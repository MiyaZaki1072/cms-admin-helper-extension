import { useState } from 'preact/hooks';
import { type ExportFormat, type ExportSheet, buildExport } from '@/core/export';
import { downloadText, fileStamp } from '../download';

interface Props {
  /** File name without extension, e.g. "stu007-report". */
  name: string;
  sheets: () => ExportSheet[];
  label?: string;
}

/** "Export CSV" / "Export XLSX" buttons. CSV takes the first sheet only. */
export function ExportMenu({ name, sheets, label = 'Export' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (format: ExportFormat) => {
    setBusy(true);
    setError(null);
    try {
      const blob = await buildExport(format, sheets());
      downloadText(`${name}-${fileStamp()}.${format}`, blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="cah-export">
      <span class="cah-muted">{label}</span>
      <button type="button" disabled={busy} onClick={() => void run('csv')}>
        CSV
      </button>
      <button type="button" disabled={busy} onClick={() => void run('xlsx')}>
        XLSX
      </button>
      {error && <span class="cah-error-text">{error}</span>}
    </span>
  );
}
