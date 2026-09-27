import type { Ref } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { type Contestant, searchContestants } from '@/features/tracker/analysis';
import { getRecent } from '@/features/tracker/recent';

interface Props {
  contestId: number;
  contestants: readonly Contestant[];
  /** Currently opened / checked user ids. */
  selected: readonly number[];
  onPick: (userId: number) => void;
  /** Checkbox mode for compare. */
  multi?: boolean;
  /** Short stats shown next to each name. */
  stats?: ReadonlyMap<number, { total: number; submissions: number }>;
  inputRef?: Ref<HTMLInputElement>;
  /** Bumped by the parent after a pick so recent picks reload. */
  recentVersion?: number;
}

export function ContestantPicker({ contestId, contestants, selected, onPick, multi, stats, inputRef, recentVersion }: Props) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<number[]>([]);

  useEffect(() => {
    void getRecent(contestId).then(setRecent);
  }, [contestId, recentVersion]);

  const results = useMemo(() => searchContestants(contestants, query, 500), [contestants, query]);
  const byId = useMemo(() => new Map(contestants.map((c) => [c.userId, c])), [contestants]);
  const pinned = query ? [] : recent.flatMap((id) => byId.get(id) ?? []);

  const item = (c: Contestant, prefix: string) => {
    const on = selected.includes(c.userId);
    const st = stats?.get(c.userId);
    return (
      <li key={`${prefix}-${c.userId}`}>
        <button
          type="button"
          class={on ? 'cah-pick cah-pick-on' : 'cah-pick'}
          onClick={() => onPick(c.userId)}
          aria-pressed={on}
          data-username={c.username}
        >
          {multi && <input type="checkbox" checked={on} tabIndex={-1} aria-hidden="true" />}
          <span class="cah-pick-user">{c.username}</span>
          <span class="cah-pick-name">
            {c.fullName}
            {c.teamCode && <span class="cah-pick-team"> · {c.teamCode}</span>}
          </span>
          {st && (
            <span class="cah-pick-stat" title={`${st.submissions} submissions`}>
              {st.total}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div class="cah-picker">
      <input
        type="search"
        ref={inputRef}
        placeholder="Search user, name or team  ( / )"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) onPick(results[0].userId);
        }}
        aria-label="Search contestants"
      />
      <div class="cah-picker-list">
        {pinned.length > 0 && (
          <>
            <div class="cah-picker-head">Recent</div>
            <ul>{pinned.map((c) => item(c, 'r'))}</ul>
            <div class="cah-picker-head">Everyone</div>
          </>
        )}
        <ul>{results.map((c) => item(c, 'a'))}</ul>
        {results.length === 0 && <p class="cah-muted">No match.</p>}
      </div>
    </div>
  );
}
