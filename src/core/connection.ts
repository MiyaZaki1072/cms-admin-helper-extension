/**
 * What the helper learns when it opens: is this CMS v1.5, who is logged in
 * and what may they do, which contests exist. Two requests.
 */
import type { AwsClient } from './aws-client';
import type { Contest, PermissionLevel } from './model';
import { ParseError, detectPermission, detectVersion, parseContests, parseCurrentAdminName, type VersionCheck } from './parsers';

export interface Connection {
  version: VersionCheck;
  /** What the admin may do; 'readonly' when the version guard failed. */
  permission: PermissionLevel;
  /** Level AWS reports, before the version guard. */
  reportedPermission: PermissionLevel;
  adminName: string | null;
  contests: Contest[];
}

export async function connect(client: AwsClient, page: Document): Promise<Connection> {
  const failures = [...detectVersion(page).failures];
  const guard = <T>(fallback: T, run: () => T): T => {
    try {
      return run();
    } catch (err) {
      if (err instanceof ParseError) {
        failures.push(err.message);
        return fallback;
      }
      throw err;
    }
  };

  const [adminsDoc, contestsDoc] = await Promise.all([client.getPage('admins'), client.getPage('contests')]);
  const reported = guard<PermissionLevel>('readonly', () => detectPermission(adminsDoc.doc));
  const contests = guard<Contest[]>([], () => parseContests(contestsDoc.doc));
  const version = { ok: failures.length === 0, failures };
  return {
    version,
    reportedPermission: reported,
    permission: version.ok ? reported : 'readonly',
    adminName: parseCurrentAdminName(adminsDoc.doc),
    contests,
  };
}

/** Whether `level` may do something that needs `need` (AWS: all implies messaging). */
export function allows(level: PermissionLevel, need: 'all' | 'messaging'): boolean {
  return level === 'all' || (need === 'messaging' && level === 'messaging');
}

export const PERMISSION_LABEL: Record<PermissionLevel, string> = {
  all: 'Full access',
  messaging: 'Messaging only',
  readonly: 'Read-only',
};
