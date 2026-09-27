/**
 * Who is in the contest: names from /contest/{c}/users, teams from the
 * ranking page (team id + name) and /teams (code), tasks from
 * /contest/{c}/tasks. Four requests, cached per contest for the session.
 */
import type { AwsClient } from '@/core/aws-client';
import type { ContestTimes, Task } from '@/core/model';
import { parseContestTasks, parseContestTimes, parseContestUsers, parseRanking, parseTeams } from '@/core/parsers';
import type { Contestant } from './analysis';

export interface Roster {
  contestants: Contestant[];
  tasks: Task[];
  teamCodes: string[];
  /** Contest start/stop as of loading (seconds since epoch). */
  times: ContestTimes | null;
}

const cache = new Map<string, Promise<Roster>>();

export function loadRoster(client: AwsClient, contestId: number, refresh = false): Promise<Roster> {
  const key = `${client.baseUrl}|${contestId}`;
  if (refresh) cache.delete(key);
  let roster = cache.get(key);
  if (!roster) {
    roster = fetchRoster(client, contestId);
    roster.catch(() => cache.delete(key));
    cache.set(key, roster);
  }
  return roster;
}

async function fetchRoster(client: AwsClient, contestId: number): Promise<Roster> {
  const [usersPage, rankingPage, tasksPage, teamsPage] = await Promise.all([
    client.getPage(`contest/${contestId}/users`),
    client.getPage(`contest/${contestId}/ranking`),
    client.getPage(`contest/${contestId}/tasks`),
    client.getPage('teams'),
  ]);
  const { participants } = parseContestUsers(usersPage.doc);
  const ranking = parseRanking(rankingPage.doc);
  const teams = parseTeams(teamsPage.doc);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rankingByUser = new Map(ranking.rows.map((r) => [r.userId, r]));
  const contestants = participants.map((u): Contestant => {
    const row = rankingByUser.get(u.id);
    const team = row?.teamId != null ? teamById.get(row.teamId) : undefined;
    return {
      userId: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: `${u.firstName} ${u.lastName}`.trim(),
      teamId: row?.teamId ?? null,
      teamCode: team?.code ?? '',
      teamName: team?.name ?? row?.teamName ?? '',
    };
  });
  return {
    contestants,
    tasks: parseContestTasks(tasksPage.doc),
    teamCodes: teams.map((t) => t.code),
    times: parseContestTimes(tasksPage.doc),
  };
}
