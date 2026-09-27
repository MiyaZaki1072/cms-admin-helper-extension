import { useMemo } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { formatDateTime } from '@/core/time';
import { byUser, summarizePerson } from '@/features/tracker/analysis';
import type { Roster } from '@/features/tracker/roster';
import { ContestantPicker } from './ContestantPicker';
import { bestClass, fmtScore } from './useTracker';

interface Props {
  contestId: number;
  roster: Roster;
  submissions: readonly Submission[];
  selected: number[];
  onChange: (ids: number[]) => void;
}

export const COMPARE_MAX = 4;

export function CompareView({ contestId, roster, submissions, selected, onChange }: Props) {
  const grouped = useMemo(() => byUser(submissions), [submissions]);
  const people = selected.map((id) => ({
    contestant: roster.contestants.find((c) => c.userId === id),
    summary: summarizePerson(id, grouped.get(id) ?? [], roster.tasks),
  }));
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < COMPARE_MAX) onChange([...selected, id]);
  };

  return (
    <div class="cah-split">
      <ContestantPicker contestId={contestId} contestants={roster.contestants} selected={selected} onPick={toggle} multi />
      <div>
        <p class="cah-muted">Pick 2 to {COMPARE_MAX} contestants ({selected.length} chosen).</p>
        {people.length > 0 && (
          <div class="cah-table-wrap">
            <table class="cah-table" data-testid="compare">
              <thead>
                <tr>
                  <th>Task</th>
                  {people.map((p) => (
                    <th key={p.summary.userId} class="cah-num">
                      {p.contestant?.username ?? p.summary.userId}
                      <div class="cah-muted cah-small">{p.contestant?.teamCode}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.name}</td>
                    {people.map((p) => {
                      const t = p.summary.tasks.find((x) => x.taskId === task.id);
                      return (
                        <td key={p.summary.userId} class={`cah-num ${bestClass(t?.best ?? null, t?.maxScore ?? null)}`}>
                          {fmtScore(t?.best ?? null)} <span class="cah-muted cah-small">({t?.attempts ?? 0} tries)</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr class="cah-total-row">
                  <td>Total</td>
                  {people.map((p) => (
                    <td key={p.summary.userId} class="cah-num">
                      <strong>{fmtScore(p.summary.total)}</strong>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Submissions</td>
                  {people.map((p) => (
                    <td key={p.summary.userId} class="cah-num">
                      {p.summary.submissions}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Compile errors</td>
                  {people.map((p) => (
                    <td key={p.summary.userId} class="cah-num">
                      {p.summary.compileErrors}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>Last activity</td>
                  {people.map((p) => (
                    <td key={p.summary.userId} class="cah-num cah-nowrap">
                      {p.summary.lastActivity === null ? '–' : formatDateTime(p.summary.lastActivity)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
