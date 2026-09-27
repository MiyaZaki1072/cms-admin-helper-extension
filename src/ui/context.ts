import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AwsClient } from '@/core/aws-client';
import type { Connection } from '@/core/connection';
import type { Contest } from '@/core/model';
import type { TrackerStore } from '@/features/tracker/store';

export interface HelperContextValue {
  client: AwsClient;
  connection: Connection;
  contest: Contest | null;
  /** Submission index of the selected contest. */
  tracker: TrackerStore | null;
  /** The overlay is showing (timers should pause when it is not). */
  visible: boolean;
  /** Set when the helper was opened for one contestant (from an AWS page). */
  personRequest: PersonRequest | null;
  setContestId: (id: number) => void;
  /** True if the admin may perform an action that needs `need`. */
  can: (need: 'all' | 'messaging') => boolean;
}

export interface PersonRequest {
  userId: number;
  /** Changes on every request, so asking for the same person twice still reacts. */
  nonce: number;
}

export const HelperContext = createContext<HelperContextValue | null>(null);

export function useHelper(): HelperContextValue {
  const value = useContext(HelperContext);
  if (!value) throw new Error('useHelper outside HelperContext');
  return value;
}
