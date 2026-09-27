/**
 * What an import would do to each row, given what CMS already has. Reads
 * only: /users, /contest/{c}/users and /teams.
 */
import type { AwsClient } from '@/core/aws-client';
import type { User } from '@/core/model';
import { parseContestUsers, parseTeams, parseUsers } from '@/core/parsers';
import { generatePassword } from './passwords';
import type { ImportRow } from './validate';

export type RowStatus = 'new' | 'add' | 'skip' | 'error';

export const STATUS_LABEL: Record<RowStatus, string> = {
  new: 'New user',
  add: 'Exists: add to contest',
  skip: 'Already in contest: skip',
  error: 'Error',
};

export interface ServerState {
  /** Exact username -> user (CMS usernames are case-sensitive). */
  users: Map<string, User>;
  participantIds: Set<number>;
  teamCodes: Set<string>;
}

export interface PlannedRow extends ImportRow {
  status: RowStatus;
  /** Existing user id (add/skip). */
  userId: number | null;
  /** The row's team does not exist yet and will be created. */
  newTeam: boolean;
}

export interface ImportOptions {
  method: 'bcrypt' | 'plaintext';
  passwordDigits: number;
}

export const DEFAULT_OPTIONS: ImportOptions = { method: 'bcrypt', passwordDigits: 4 };

export interface ImportPlan {
  rows: PlannedRow[];
  newTeams: string[];
  counts: Record<RowStatus, number>;
}

export async function loadServerState(client: AwsClient, contestId: number): Promise<ServerState> {
  const [users, contestUsers, teams] = await Promise.all([
    client.getPage('users'),
    client.getPage(`contest/${contestId}/users`),
    client.getPage('teams'),
  ]);
  return {
    users: new Map(parseUsers(users.doc).map((u) => [u.username, u])),
    participantIds: new Set(parseContestUsers(contestUsers.doc).participants.map((u) => u.id)),
    teamCodes: new Set(parseTeams(teams.doc).map((t) => t.code)),
  };
}

export function planImport(
  rows: readonly ImportRow[],
  server: ServerState,
  options: ImportOptions,
  makePassword: (digits: number) => string = generatePassword,
): ImportPlan {
  const lowerNames = new Map<string, string>();
  for (const name of server.users.keys()) lowerNames.set(name.toLowerCase(), name);
  const newTeams = new Set<string>();

  const planned = rows.map((source): PlannedRow => {
    const row: PlannedRow = { ...source, errors: [...source.errors], warnings: [...source.warnings], status: 'error', userId: null, newTeam: false };
    if (row.team && !server.teamCodes.has(row.team)) {
      row.newTeam = true;
      if (row.errors.length === 0) newTeams.add(row.team);
    }
    if (row.errors.length > 0) return row;

    const existing = server.users.get(row.username);
    if (existing) {
      row.userId = existing.id;
      row.status = server.participantIds.has(existing.id) ? 'skip' : 'add';
      if (row.password) row.warnings.push('Password ignored: the user already exists (use password reset instead)');
      const differs = [
        row.firstName && row.firstName !== existing.firstName && 'first name',
        row.lastName && row.lastName !== existing.lastName && 'last name',
      ].filter(Boolean);
      if (differs.length > 0) row.warnings.push(`CMS has a different ${differs.join(' and ')}; the user is not changed`);
      return row;
    }

    const clash = lowerNames.get(row.username.toLowerCase());
    if (clash) row.warnings.push(`CMS already has "${clash}", which differs only in case`);
    row.status = 'new';
    if (!row.password) {
      row.password = makePassword(options.passwordDigits);
      row.passwordGenerated = true;
    }
    return row;
  });

  const counts: Record<RowStatus, number> = { new: 0, add: 0, skip: 0, error: 0 };
  for (const r of planned) counts[r.status]++;
  return { rows: planned, newTeams: [...newTeams].sort(), counts };
}
