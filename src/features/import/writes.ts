/**
 * The AWS forms bulk import and bulk actions use. Each write is checked by
 * what AWS shows afterwards (the redirect target or the page it redirects
 * to), and failures carry AWS's notification text when there is one.
 */
import type { AwsClient } from '@/core/aws-client';
import {
  parseContestUsers,
  parseParticipationForm,
  parseParticipationPage,
  parseTeams,
  parseUserPage,
  setField,
} from '@/core/parsers';
import { PARTICIPATION } from '@/core/parsers/selectors';
import type { ImportApi } from './runner';

export class StepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StepError';
  }
}

async function awsReason(client: AwsClient, fallback: string): Promise<string> {
  try {
    const notes = await client.readNotifications();
    const text = notes.map((n) => [n.subject, n.text].filter(Boolean).join(' ')).join(' | ');
    return text ? text.slice(0, 300) : fallback;
  } catch {
    return fallback;
  }
}

/** "10.0.0.12/32, 10.1.0.0/16" and "10.0.0.12,10.1.0.0/16" compare equal. */
export function normalizeIps(value: string): string {
  return value
    .split(',')
    .map((s) => s.trim().replace(/\/(32|128)$/, ''))
    .filter(Boolean)
    .sort()
    .join(',');
}

export interface ContestWrites extends ImportApi {
  removeParticipation(userId: number): Promise<void>;
  resetPassword(userId: number, password: string, method: 'bcrypt' | 'plaintext'): Promise<void>;
  participantIds(): Promise<Set<number>>;
}

export function contestWrites(client: AwsClient, contestId: number, signal?: AbortSignal): ContestWrites {
  const opts = { signal };
  return {
    async createTeam(code) {
      await client.postForm('teams/add', { code, name: code }, { multipart: true, ...opts });
    },

    async listTeams() {
      const { doc } = await client.getPage('teams', opts);
      return new Set(parseTeams(doc).map((t) => t.code));
    },

    async createUser(row, method) {
      const result = await client.postForm(
        'users/add',
        [
          ['first_name', row.firstName],
          ['last_name', row.lastName],
          ['username', row.username],
          ['password', row.password],
          ['method', method],
          ['email', row.email],
          ['timezone', row.timezone],
          ['preferred_languages', row.languages.join(',')],
        ],
        { multipart: true, ...opts },
      );
      const m = /^user\/(\d+)$/.exec(result.path);
      if (!m) throw new StepError(await awsReason(client, 'AWS did not create the user'));
      return Number(m[1]);
    },

    async addParticipation(userId, flags) {
      const result = await client.postForm(
        `user/${userId}/add_participation`,
        { contest_id: String(contestId), hidden: flags.hidden, unrestricted: flags.unrestricted },
        opts,
      );
      const page = result.doc ? parseUserPage(result.doc) : null;
      if (!page?.participations.some((p) => p.contestId === contestId)) {
        throw new StepError(await awsReason(client, 'AWS did not add the participation'));
      }
    },

    async updateParticipation(userId, changes) {
      const path = `contest/${contestId}/user/${userId}/edit`;
      const { doc } = await client.getPage(path, opts);
      const form = doc.querySelector<HTMLFormElement>(PARTICIPATION.form);
      if (!form) throw new StepError('Participation form not found');
      // Read-modify-write: every field goes back as AWS rendered it.
      let fields = parseParticipationForm(form).fields;
      if (changes.team !== undefined) fields = setField(fields, 'team', changes.team);
      if (changes.ip !== undefined) fields = setField(fields, 'ip', changes.ip);
      if (changes.extraTime !== undefined) fields = setField(fields, 'extra_time', String(changes.extraTime));
      const result = await client.postForm(path, fields, { multipart: true, ...opts });
      const after = result.doc ? parseParticipationPage(result.doc).form : null;
      const kept =
        after !== null &&
        (changes.team === undefined || after.team === changes.team) &&
        (changes.ip === undefined || normalizeIps(after.ip) === normalizeIps(changes.ip)) &&
        (changes.extraTime === undefined || after.extraTime === changes.extraTime);
      if (!kept) throw new StepError(await awsReason(client, 'AWS did not keep the participation change'));
    },

    async removeParticipation(userId) {
      const result = await client.postForm(`user/${userId}/edit_participation`, { contest_id: String(contestId), operation: 'Remove' }, opts);
      const page = result.doc ? parseUserPage(result.doc) : null;
      if (!page || page.participations.some((p) => p.contestId === contestId)) {
        throw new StepError(await awsReason(client, 'AWS did not remove the participation'));
      }
    },

    async resetPassword(userId, password, method) {
      const { doc } = await client.getPage(`user/${userId}`, opts);
      const before = parseUserPage(doc);
      const fields = setField(setField(before.fields, 'password', password), 'method', method);
      const result = await client.postForm(`user/${userId}`, fields, { multipart: true, ...opts });
      const after = result.doc ? parseUserPage(result.doc) : null;
      const ok = after !== null && after.method === method && (method === 'bcrypt' || after.password === password);
      if (!ok) throw new StepError(await awsReason(client, 'AWS did not change the password'));
    },

    async participantIds() {
      const { doc } = await client.getPage(`contest/${contestId}/users`, opts);
      return new Set(parseContestUsers(doc).participants.map((u) => u.id));
    },
  };
}
