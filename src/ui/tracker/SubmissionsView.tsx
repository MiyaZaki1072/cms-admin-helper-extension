import { useMemo, useState } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { formatDateTime, fromLocalInput, zoneLabel } from '@/core/time';
import { type Filters, NO_FILTERS, type StatusFilter, applyFilters } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ExportMenu } from '../components/ExportMenu';
import { SubmissionList } from './SubmissionList';

interface Props {
  roster: Roster;
  submissions: readonly Submission[];
  onUser: (userId: number) => void;
}

const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function SubmissionsView({ roster, submissions, onUser }: Props) {
  const [users, setUsers] = useState('');
  const [f, setF] = useState<Omit<Filters, 'userIds' | 'from' | 'to'>>(NO_FILTERS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const userIds = useMemo(() => {
    const names = users
      .split(/[\s,]+/)
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);
    if (names.length === 0) return [];
    const ids = roster.contestants.filter((c) => names.includes(c.username.toLowerCase())).map((c) => c.userId);
    return ids.length > 0 ? ids : [-1];
  }, [users, roster]);

  const filters: Filters = { ...f, userIds, from: fromLocalInput(from), to: fromLocalInput(to) };
  const result = useMemo(() => applyFilters(submissions, filters, roster.contestants), [submissions, roster, JSON.stringify(filters)]);
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const team = new Map(roster.contestants.map((c) => [c.userId, c.teamCode]));

  const exportSheets = () => [
    {
      name: 'Submissions',
      rows: [
        [`Time (${zoneLabel()})`, 'Time (UTC)', 'Id', 'Username', 'Team', 'Task', 'Status', 'Score', 'Max', 'Official'],
        ...result.map((s) => [
          formatDateTime(s.timestamp),
          new Date(s.timestamp).toISOString(),
          s.id,
          s.username,
          team.get(s.userId) ?? '',
          s.taskName,
          s.statusText,
          s.score,
          s.maxScore,
          s.official ? 'yes' : 'no',
        ]),
      ],
    },
  ];

  return (
    <div>
      <div class="cah-filters">
        <label>
          Users
          <input type="text" placeholder="stu001, stu007" value={users} onInput={(e) => setUsers(e.currentTarget.value)} aria-label="Users filter" />
        </label>
        <label>
          Team
          <select value={f.teamCode} onChange={(e) => set({ teamCode: e.currentTarget.value })} aria-label="Team">
            <option value="">All</option>
            {roster.teamCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Task
          <select
            value={f.taskId ?? ''}
            onChange={(e) => set({ taskId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
            aria-label="Task"
          >
            <option value="">All</option>
            {roster.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={f.status} onChange={(e) => set({ status: e.currentTarget.value as StatusFilter })} aria-label="Status">
            <option value="any">Any</option>
            <option value="scored">Scored</option>
            <option value="compilation_failed">Compile failed</option>
            <option value="pending">Evaluating</option>
          </select>
        </label>
        <label>
          Score
          <span class="cah-range">
            <input type="number" placeholder="min" value={f.scoreMin ?? ''} onInput={(e) => set({ scoreMin: num(e.currentTarget.value) })} aria-label="Minimum score" />
            –
            <input type="number" placeholder="max" value={f.scoreMax ?? ''} onInput={(e) => set({ scoreMax: num(e.currentTarget.value) })} aria-label="Maximum score" />
          </span>
        </label>
        <label>
          From ({zoneLabel()})
          <input type="datetime-local" value={from} onInput={(e) => setFrom(e.currentTarget.value)} aria-label="From" />
        </label>
        <label>
          To ({zoneLabel()})
          <input type="datetime-local" value={to} onInput={(e) => setTo(e.currentTarget.value)} aria-label="To" />
        </label>
        <label class="cah-check">
          <input type="checkbox" checked={f.improvedOnly} onChange={(e) => set({ improvedOnly: e.currentTarget.checked })} />
          Improved score only
        </label>
        <button
          type="button"
          onClick={() => {
            setF(NO_FILTERS);
            setUsers('');
            setFrom('');
            setTo('');
          }}
        >
          Reset
        </button>
      </div>
      <div class="cah-toolbar">
        <span data-testid="filter-count">
          {result.length} of {submissions.length} submissions
        </span>
        <span class="cah-spacer" />
        <ExportMenu name="submissions" sheets={exportSheets} />
      </div>
      <SubmissionList submissions={result} showUser onUser={onUser} />
    </div>
  );
}
