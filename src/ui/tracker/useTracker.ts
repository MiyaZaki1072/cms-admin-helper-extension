import { useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import type { Submission } from '@/core/model';
import { type Roster, loadRoster } from '@/features/tracker/roster';
import { useHelper } from '../context';

/** Submission index + roster of the selected contest, re-rendering on every change. */
export function useTrackerData(): {
  submissions: Submission[];
  roster: Roster | null;
  rosterError: string | null;
  reloadRoster: () => void;
} {
  const { tracker, client, contest } = useHelper();
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterNonce, setRosterNonce] = useState(0);

  useEffect(() => tracker?.onChange(() => bump(undefined)), [tracker]);

  useEffect(() => {
    if (!contest) return;
    setRosterError(null);
    let live = true;
    loadRoster(client, contest.id, rosterNonce > 0).then(
      (r) => live && setRoster(r),
      (err: unknown) => live && setRosterError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      live = false;
    };
  }, [client, contest?.id, rosterNonce]);

  const submissions = useMemo(() => [...(tracker?.submissions.values() ?? [])], [tracker, version]);
  return { submissions, roster, rosterError, reloadRoster: () => setRosterNonce((n) => n + 1) };
}

/** Score cell class: full, partial, zero, compile error, pending. */
export function scoreClass(s: Pick<Submission, 'status' | 'score' | 'maxScore'>): string {
  if (s.status === 'compilation_failed') return 'cah-s-ce';
  if (s.status !== 'scored') return 'cah-s-pending';
  if (s.score !== null && s.maxScore !== null && s.score >= s.maxScore) return 'cah-s-full';
  return (s.score ?? 0) > 0 ? 'cah-s-partial' : 'cah-s-zero';
}

export function bestClass(best: number | null, max: number | null): string {
  if (best === null) return '';
  if (max !== null && best >= max) return 'cah-s-full';
  return best > 0 ? 'cah-s-partial' : 'cah-s-zero';
}

export const fmtScore = (n: number | null): string => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(2));
