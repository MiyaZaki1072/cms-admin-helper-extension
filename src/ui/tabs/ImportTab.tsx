import { useMemo, useState } from 'preact/hooks';
import { formatDuration } from '@/core/duration';
import { FIELD_LABEL, IMPORT_FIELDS, type ImportField, guessMapping } from '@/features/import/fields';
import { expandPattern, parseText, readImportFile } from '@/features/import/parse';
import { DEFAULT_OPTIONS, type ImportOptions, type ImportPlan, type RowStatus, STATUS_LABEL, loadServerState, planImport } from '@/features/import/plan';
import { validateRows } from '@/features/import/validate';
import { useHelper } from '../context';
import { ManageUsers } from '../import/ManageUsers';
import { RunPanel } from '../import/RunPanel';

type Source = 'paste' | 'file' | 'pattern';

const SAMPLE = `username,first_name,last_name,password,email,team,ip,hidden,unrestricted,extra_time,timezone,languages
stu101,Somchai,Jaidee,,somchai@school.ac.th,BKK01,,false,false,0,Asia/Bangkok,th`;

export function ImportTab() {
  const { client, contest } = useHelper();
  const [source, setSource] = useState<Source>('paste');
  const [text, setText] = useState('');
  const [pattern, setPattern] = useState('stu{001..030}');
  const [patternTeam, setPatternTeam] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Array<ImportField | null>>([]);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (rows: string[][]) => {
    setPlan(null);
    setError(null);
    setTable(rows);
    const guess = guessMapping(rows[0] ?? []);
    setHasHeader(guess.hasHeader);
    setMapping(guess.mapping);
    if (rows.length === 0) setError('No rows found.');
  };

  const fromPattern = () => {
    const r = expandPattern(pattern);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    load([['username', 'team'], ...r.names.map((n) => [n, patternTeam.trim()])]);
  };

  const rows = useMemo(() => (table.length ? validateRows(table, mapping, hasHeader) : []), [table, mapping, hasHeader]);
  const columns = Math.max(0, ...table.map((r) => r.length));
  const sample = table.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 3);

  const check = async () => {
    if (!contest) return;
    setBusy(true);
    setError(null);
    try {
      const server = await loadServerState(client, contest.id);
      setPlan(planImport(rows, server, options));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!contest) return <p class="cah-pad cah-muted">No contest selected.</p>;
  const shownRows = plan ? plan.rows.filter((r) => !problemsOnly || r.status === 'error' || r.warnings.length > 0) : [];

  return (
    <section class="cah-panel cah-import">
      <div class="cah-card">
        <h3>1. Users to import into {contest.name}</h3>
        <nav class="cah-subnav" aria-label="Import source">
          {(['paste', 'file', 'pattern'] as const).map((s) => (
            <button key={s} type="button" class={source === s ? 'cah-subnav-on' : ''} aria-pressed={source === s} onClick={() => setSource(s)}>
              {s === 'paste' ? 'Paste' : s === 'file' ? 'CSV / Excel file' : 'Generate from pattern'}
            </button>
          ))}
        </nav>
        {source === 'paste' && (
          <>
            <textarea
              class="cah-paste"
              rows={8}
              placeholder={`Paste CSV or cells copied from Excel / Google Sheets. Only username is required.\n\n${SAMPLE}`}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
              aria-label="Paste users"
            />
            <div class="cah-toolbar">
              <button type="button" class="cah-primary" disabled={!text.trim()} onClick={() => load(parseText(text))}>
                Read
              </button>
              <span class="cah-muted">Columns: username, first_name, last_name, password, email, team, ip, hidden, unrestricted, extra_time, timezone, languages</span>
            </div>
          </>
        )}
        {source === 'file' && (
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
            aria-label="Import file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) readImportFile(file).then(load, (err: unknown) => setError(String(err)));
            }}
          />
        )}
        {source === 'pattern' && (
          <div class="cah-toolbar">
            <label>
              Usernames <input type="text" value={pattern} onInput={(e) => setPattern(e.currentTarget.value)} aria-label="Username pattern" />
            </label>
            <label>
              Team (optional) <input type="text" size={8} value={patternTeam} onInput={(e) => setPatternTeam(e.currentTarget.value)} aria-label="Pattern team" />
            </label>
            <button type="button" class="cah-primary" onClick={fromPattern}>
              Generate
            </button>
            <span class="cah-muted">e.g. stu{'{001..120}'}; passwords are generated.</span>
          </div>
        )}
        {error && <div class="cah-banner cah-banner-error">{error}</div>}
      </div>

      {table.length > 0 && (
        <div class="cah-card">
          <h3>2. Columns</h3>
          <label class="cah-check">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.currentTarget.checked)} /> First row is a header
          </label>
          <div class="cah-table-wrap">
            <table class="cah-table" data-testid="import-mapping">
              <thead>
                <tr>
                  {Array.from({ length: columns }, (_, i) => (
                    <th key={i}>
                      <select
                        value={mapping[i] ?? ''}
                        aria-label={`Column ${i + 1}`}
                        onChange={(e) => {
                          const next = [...mapping];
                          while (next.length < columns) next.push(null);
                          const value = (e.currentTarget.value || null) as ImportField | null;
                          for (let j = 0; j < next.length; j++) if (value && next[j] === value) next[j] = null;
                          next[i] = value;
                          setMapping(next);
                          setPlan(null);
                        }}
                      >
                        <option value="">(ignore)</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {FIELD_LABEL[f]}
                          </option>
                        ))}
                      </select>
                      {hasHeader && <div class="cah-muted cah-small">{table[0]?.[i]}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr key={i}>
                    {Array.from({ length: columns }, (_, j) => (
                      <td key={j}>{r[j] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!mapping.includes('username') && <p class="cah-error-text">Choose which column holds the username.</p>}

          <h3>3. Passwords</h3>
          <div class="cah-toolbar">
            <label class="cah-check">
              <input type="radio" name="cah-method" checked={options.method === 'bcrypt'} onChange={() => setOptions({ ...options, method: 'bcrypt' })} /> Hashed
              (bcrypt, recommended)
            </label>
            <label class="cah-check">
              <input type="radio" name="cah-method" checked={options.method === 'plaintext'} onChange={() => setOptions({ ...options, method: 'plaintext' })} />{' '}
              Plain text
            </label>
            <label>
              Generated passwords: word +{' '}
              <select value={options.passwordDigits} onChange={(e) => setOptions({ ...options, passwordDigits: Number(e.currentTarget.value) })} aria-label="Password digits">
                {[3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d} digits
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p class="cah-muted">
            Blank passwords are generated for new users. With bcrypt, CMS cannot show a password again: save the result file after
            the import. Passwords are never stored by the helper.
          </p>
          <button type="button" class="cah-primary" disabled={busy || !mapping.includes('username') || rows.length === 0} onClick={() => void check()}>
            {busy ? 'Checking…' : `Check ${rows.length} rows against CMS`}
          </button>
        </div>
      )}

      {plan && (
        <div class="cah-card cah-wide-card">
          <h3>4. Preview</h3>
          <div class="cah-toolbar" data-testid="import-counts">
            {(Object.keys(STATUS_LABEL) as RowStatus[]).map((s) => (
              <span key={s} class={`cah-chip cah-st-${s}`}>
                {STATUS_LABEL[s]}: {plan.counts[s]}
              </span>
            ))}
            {plan.newTeams.length > 0 && <span class="cah-chip">New teams: {plan.newTeams.join(', ')}</span>}
            <label class="cah-check">
              <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.currentTarget.checked)} /> Only rows with problems
            </label>
          </div>
          <p class="cah-muted">Nothing has been sent to CMS.</p>
          <div class="cah-table-wrap">
            <table class="cah-table" data-testid="import-preview">
              <thead>
                <tr>
                  <th class="cah-num">Line</th>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Password</th>
                  <th>IP</th>
                  <th>Extra time</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={r.line} data-line={r.line} data-status={r.status}>
                    <td class="cah-num">{r.line}</td>
                    <td>{r.username}</td>
                    <td>{`${r.firstName} ${r.lastName}`.trim()}</td>
                    <td>
                      {r.team}
                      {r.newTeam && <span class="cah-muted cah-small"> (new)</span>}
                    </td>
                    <td>
                      {r.status === 'new' ? (
                        <code title={r.passwordGenerated ? 'Generated' : 'From the file'}>{r.password}</code>
                      ) : (
                        <span class="cah-muted">—</span>
                      )}
                      {r.passwordGenerated && <span class="cah-muted cah-small"> gen</span>}
                    </td>
                    <td>{r.ip}</td>
                    <td>{r.extraTime ? formatDuration(r.extraTime) : ''}</td>
                    <td>
                      <span class={`cah-chip cah-st-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td class="cah-notes">
                      {r.errors.map((e) => (
                        <div key={e} class="cah-error-text">
                          {e}
                        </div>
                      ))}
                      {r.warnings.map((w) => (
                        <div key={w} class="cah-muted">
                          {w}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {plan && <RunPanel plan={plan} options={options} />}
      <ManageUsers />
    </section>
  );
}
