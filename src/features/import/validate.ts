/** Turning mapped spreadsheet rows into checked import rows. */
import { parseDuration } from '@/core/duration';
import { isValidZone } from '@/core/time';
import type { ImportField } from './fields';

export interface ImportRow {
  /** 1-based line in the source (header counts). */
  line: number;
  username: string;
  firstName: string;
  lastName: string;
  /** As given; generated later for new users when blank. */
  password: string;
  passwordGenerated: boolean;
  email: string;
  team: string;
  /** Normalised comma list, e.g. "10.0.0.12, 10.1.0.0/16". */
  ip: string;
  hidden: boolean;
  unrestricted: boolean;
  /** Seconds, null when not given. */
  extraTime: number | null;
  timezone: string;
  languages: string[];
  errors: string[];
  warnings: string[];
}

export const USERNAME_RE = /^[A-Za-z0-9._@-]+$/;

export function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['', 'false', 'no', 'n', '0', 'f', '-'].includes(v)) return false;
  if (['true', 'yes', 'y', '1', 't', 'x', '✓'].includes(v)) return true;
  return null;
}

function ipv4Error(address: string, prefix: number | null): string | null {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return `"${address}" is not an IPv4 address`;
  if (prefix === null) return null;
  if (prefix > 32) return `/${prefix} is not a valid IPv4 prefix`;
  const value = parts.reduce((acc, p) => acc * 256 + Number(p), 0);
  const hostBits = 32 - prefix;
  const mask = hostBits === 32 ? 0xffffffff : 2 ** hostBits - 1;
  if (value % (mask + 1) !== 0) {
    const network = Math.floor(value / (mask + 1)) * (mask + 1);
    const text = [24, 16, 8, 0].map((s) => Math.floor(network / 2 ** s) % 256).join('.');
    return `${address}/${prefix} has host bits set (CMS rejects it); did you mean ${text}/${prefix}?`;
  }
  return null;
}

function ipv6Error(address: string, prefix: number | null): string | null {
  try {
    new URL(`http://[${address}]/`);
  } catch {
    return `"${address}" is not an IP address`;
  }
  if (prefix !== null && prefix > 128) return `/${prefix} is not a valid IPv6 prefix`;
  return null;
}

/** Validate a comma list of IPs/subnets the way CMS parses it; returns [normalised, errors]. */
export function checkIpList(value: string): [string, string[]] {
  const items = value
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const errors: string[] = [];
  for (const item of items) {
    const [address = '', prefixText] = item.split('/');
    const prefix = prefixText === undefined ? null : /^\d+$/.test(prefixText) ? Number(prefixText) : NaN;
    if (Number.isNaN(prefix)) {
      errors.push(`"${item}" has an invalid prefix`);
      continue;
    }
    const error = address.includes(':') ? ipv6Error(address, prefix) : ipv4Error(address, prefix);
    if (error) errors.push(error);
  }
  return [items.join(', '), errors];
}

const LANG_RE = /^[a-z]{2,3}([_-][A-Za-z]{2,4})?$/;

/** One source row -> ImportRow with field-level checks (duplicates are checked in validateRows). */
export function toImportRow(cells: readonly string[], mapping: ReadonlyArray<ImportField | null>, line: number): ImportRow {
  const get = (field: ImportField) => {
    const index = mapping.indexOf(field);
    return index >= 0 ? (cells[index] ?? '').trim() : '';
  };
  const errors: string[] = [];
  const warnings: string[] = [];

  const username = get('username');
  if (!username) errors.push('Username is empty');
  else if (!USERNAME_RE.test(username)) errors.push('Username may only contain letters, digits and . _ - @');

  const email = get('email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`"${email}" is not an email address`);

  const [ip, ipErrors] = checkIpList(get('ip'));
  errors.push(...ipErrors);

  const flag = (field: 'hidden' | 'unrestricted') => {
    const b = parseBool(get(field));
    if (b === null) errors.push(`${field} must be true/false (got "${get(field)}")`);
    return b ?? false;
  };
  const hidden = flag('hidden');
  const unrestricted = flag('unrestricted');

  const extraText = get('extra_time');
  let extraTime: number | null = null;
  if (extraText) {
    extraTime = parseDuration(extraText);
    if (extraTime === null || extraTime < 0) {
      errors.push(`Extra time "${extraText}" is not a duration (use seconds or e.g. 10m)`);
      extraTime = null;
    }
  }

  const timezone = get('timezone');
  if (timezone && !isValidZone(timezone)) errors.push(`"${timezone}" is not a timezone name (e.g. Asia/Bangkok)`);

  const languages = get('languages')
    .split(/[,;\s]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const badLangs = languages.filter((l) => !LANG_RE.test(l));
  if (badLangs.length > 0) errors.push(`Unknown language code ${badLangs.map((l) => `"${l}"`).join(', ')} (use e.g. th, en)`);

  const team = get('team');
  if (team && /\s/.test(team)) errors.push(`Team code "${team}" contains spaces`);

  const password = get('password');
  if (password && password !== password.trim()) warnings.push('Password has spaces at the ends');

  return {
    line,
    username,
    firstName: get('first_name'),
    lastName: get('last_name'),
    password,
    passwordGenerated: false,
    email,
    team,
    ip,
    hidden,
    unrestricted,
    extraTime,
    timezone,
    languages,
    errors,
    warnings,
  };
}

/** All data rows, with duplicate usernames flagged on every occurrence. */
export function validateRows(table: readonly string[][], mapping: ReadonlyArray<ImportField | null>, hasHeader: boolean): ImportRow[] {
  const start = hasHeader ? 1 : 0;
  const rows = table.slice(start).map((cells, i) => toImportRow(cells, mapping, i + start + 1));
  const lines = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.username) continue;
    const key = row.username;
    lines.set(key, [...(lines.get(key) ?? []), row.line]);
  }
  const lower = new Map<string, Set<string>>();
  for (const name of lines.keys()) {
    const k = name.toLowerCase();
    lower.set(k, new Set([...(lower.get(k) ?? []), name]));
  }
  for (const row of rows) {
    const same = lines.get(row.username);
    if (same && same.length > 1) row.errors.push(`Username appears ${same.length} times (lines ${same.join(', ')})`);
    const variants = lower.get(row.username.toLowerCase());
    if (variants && variants.size > 1) {
      row.warnings.push(`Differs only in upper/lower case from ${[...variants].filter((v) => v !== row.username).join(', ')}`);
    }
  }
  return rows;
}
