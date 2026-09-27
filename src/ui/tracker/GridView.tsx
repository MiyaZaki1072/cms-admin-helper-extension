import { useMemo, useState } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { formatDateTime, zoneLabel } from '@/core/time';
import { FLAG_LABEL, type Flag, type GridRow, buildGrid } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ExportMenu } from '../components/ExportMenu';
import { bestClass, fmtScore } from './useTracker';

interface Props {
  roster: Roster;
  submissions: readonly Submission[];
  onPick: (userId: number) => void;
}

type SortKey = 'username' | 'team' | 'total' | 'submissions' | 'compileErrors' | 'last' | `task:${number}`;

export function GridView({ roster, submissions, onPick }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'total', desc: true });
  const [team, setTeam] = useState('');
  const [flag, setFlag] = useState<Flag | ''>('');

  const now = Date.now();
  const times = roster.times;
  const running = times ? now >= times.start * 1000 && now <= times.stop * 1000 : false;
  const rows = useMemo(
    () => buildGrid(roster.contestants, submissions, roster.tasks, { now, contestRunning: running }),
    [roster, submissions, running],
  );

  const value = (r: GridRow, key: SortKey): string | number => {
    if (key.startsWith('task:')) return r.tasks.find((t) => t.taskId === Number(key.slice(5)))?.best ?? -1;
    switch (key) {
      case 'username':
        return r.contestant.username;
      case 'team':
        return r.contestant.teamCode;
      case 'total':
        return r.total;
      case 'submissions':
        return r.submissions;
      case 'compileErrors':
        return r.compileErrors;
      default:
        return r.lastActivity ?? 0;
    }
  };
  const shown = rows
    .filter((r) => (!team || r.contestant.teamCode === team) && (!flag || r.flags.includes(flag)))
    .sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      const c = typeof va === 'string' ? va.localeCompare(String(vb)) : va - (vb as number);
      return (sort.desc ? -c : c) || a.contestant.username.localeCompare(b.contestant.username);
    });

  const header = (key: SortKey, label: string, num = false) => (
    <th
      class={`${num ? 'cah-num ' : ''}cah-sortable`}
      aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'username' && key !== 'team' })}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  );

  const exportSheets = () => [
    {
      name: 'Grid',
      rows: [
        ['Username', 'Name', 'Team', ...roster.tasks.map((t) => t.name), 'Total', 'Submissions', 'Compile errors', `Last activity (${zoneLabel()})`, 'Flags'],
        ...shown.map((r) => [
          r.contestant.username,
          r.contestant.fullName,
          r.contestant.teamCode,
          ...roster.tasks.map((t) => r.tasks.find((x) => x.taskId === t.id)?.best ?? null),
          r.total,
          r.submissions,
          r.compileErrors,
          r.lastActivity === null ? '' : formatDateTime(r.lastActivity),
          r.flags.map((f) => FLAG_LABEL[f]).join('; '),
        ]),
      ],
    },
  ];

  return (
    <div>
      <div class="cah-toolbar">
        <label>
          Team{' '}
          <select value={team} onChange={(e) => setTeam(e.currentTarget.value)} aria-label="Team filter">
            <option value="">All</option>
            {roster.teamCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flag{' '}
          <select value={flag} onChange={(e) => setFlag(e.currentTarget.value as Flag | '')} aria-label="Flag filter">
            <option value="">Any</option>
            {(Object.keys(FLAG_LABEL) as Flag[]).map((f) => (
              <option key={f} value={f}>
                {FLAG_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <span class="cah-muted">
          {shown.length} of {rows.length} contestants
        </span>
        <span class="cah-spacer" />
        <ExportMenu name="contest-grid" sheets={exportSheets} />
      </div>
      <div class="cah-table-wrap">
        <table class="cah-table" data-testid="grid">
          <thead>
            <tr>
              {header('username', 'User')}
              {header('team', 'Team')}
              {roster.tasks.map((t) => header(`task:${t.id}`, t.name, true))}
              {header('total', 'Total', true)}
              {header('submissions', 'Subs', true)}
              {header('compileErrors', 'CE', true)}
              {header('last', 'Last activity')}
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.userId} class="cah-clickable" data-username={r.contestant.username} onClick={() => onPick(r.userId)}>
                <td>
                  <strong>{r.contestant.username}</strong> <span class="cah-muted">{r.contestant.fullName}</span>
                </td>
                <td>{r.contestant.teamCode}</td>
                {roster.tasks.map((t) => {
                  const ts = r.tasks.find((x) => x.taskId === t.id);
                  return (
                    <td key={t.id} class={`cah-num ${bestClass(ts?.best ?? null, ts?.maxScore ?? null)}`} title={`${ts?.attempts ?? 0} attempts`}>
                      {fmtScore(ts?.best ?? null)}
                      <span class="cah-muted cah-small"> ({ts?.attempts ?? 0})</span>
                    </td>
                  );
                })}
                <td class="cah-num">
                  <strong>{fmtScore(r.total)}</strong>
                </td>
                <td class="cah-num">{r.submissions}</td>
                <td class="cah-num">{r.compileErrors}</td>
                <td class="cah-nowrap">{r.lastActivity === null ? '–' : formatDateTime(r.lastActivity)}</td>
                <td>
                  {r.flags.map((f) => (
                    <span key={f} class={`cah-flag cah-flag-${f}`}>
                      {FLAG_LABEL[f]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
