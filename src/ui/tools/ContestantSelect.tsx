import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Contestant } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';

type Mode = 'all' | 'team' | 'list' | 'pick';

interface Props {
  roster: Roster;
  onChange: (people: Contestant[]) => void;
  label?: string;
}

/** Choose contestants: everyone, a team, a list of usernames, or tick them one by one. */
export function ContestantSelect({ roster, onChange, label = 'Who' }: Props) {
  const [mode, setMode] = useState<Mode>('team');
  const [team, setTeam] = useState(roster.teamCodes[0] ?? '');
  const [list, setList] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');

  const chosen = useMemo(() => {
    const all = roster.contestants;
    if (mode === 'all') return all;
    if (mode === 'team') return all.filter((c) => c.teamCode === team);
    if (mode === 'list') {
      const names = new Set(
        list
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
      return all.filter((c) => names.has(c.username.toLowerCase()));
    }
    return all.filter((c) => picked.has(c.userId));
  }, [roster, mode, team, list, picked]);

  useEffect(() => onChange(chosen), [chosen]);

  const unknown =
    mode === 'list'
      ? list
          .split(/[\s,;]+/)
          .map((s) => s.trim())
          .filter((s) => s && !roster.contestants.some((c) => c.username.toLowerCase() === s.toLowerCase()))
      : [];
  const shown = roster.contestants.filter((c) => !query || c.username.includes(query) || c.fullName.toLowerCase().includes(query.toLowerCase()));

  return (
    <div class="cah-select-people">
      <div class="cah-toolbar">
        <span>{label}:</span>
        {(['all', 'team', 'list', 'pick'] as const).map((m) => (
          <label key={m} class="cah-check">
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'all' ? 'Everyone' : m === 'team' ? 'A team' : m === 'list' ? 'Usernames' : 'Pick'}
          </label>
        ))}
        <strong data-testid="selected-count">{chosen.length} selected</strong>
      </div>
      {mode === 'team' && (
        <select value={team} onChange={(e) => setTeam(e.currentTarget.value)} aria-label="Team">
          {roster.teamCodes.map((c) => (
            <option key={c} value={c}>
              {c} ({roster.contestants.filter((x) => x.teamCode === c).length})
            </option>
          ))}
        </select>
      )}
      {mode === 'list' && (
        <>
          <textarea rows={3} class="cah-paste" placeholder="stu001, stu002 …" value={list} onInput={(e) => setList(e.currentTarget.value)} aria-label="Usernames" />
          {unknown.length > 0 && <p class="cah-error-text">Not in this contest: {unknown.join(', ')}</p>}
        </>
      )}
      {mode === 'pick' && (
        <>
          <input type="search" placeholder="Filter" value={query} onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Filter contestants" />
          <div class="cah-pick-grid">
            {shown.map((c) => (
              <label key={c.userId} class="cah-check">
                <input
                  type="checkbox"
                  checked={picked.has(c.userId)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.currentTarget.checked) next.add(c.userId);
                    else next.delete(c.userId);
                    setPicked(next);
                  }}
                />
                {c.username}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
