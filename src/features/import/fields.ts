/** Import columns and loose header matching ("User", "ชื่อผู้ใช้", "E-mail" ...). */

export const IMPORT_FIELDS = [
  'username',
  'first_name',
  'last_name',
  'password',
  'email',
  'team',
  'ip',
  'hidden',
  'unrestricted',
  'extra_time',
  'timezone',
  'languages',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABEL: Record<ImportField, string> = {
  username: 'Username',
  first_name: 'First name',
  last_name: 'Last name',
  password: 'Password',
  email: 'Email',
  team: 'Team code',
  ip: 'IP / subnet',
  hidden: 'Hidden',
  unrestricted: 'Unrestricted',
  extra_time: 'Extra time',
  timezone: 'Timezone',
  languages: 'Languages',
};

const ALIASES: Record<ImportField, string[]> = {
  username: ['username', 'user', 'user name', 'login', 'login name', 'account', 'ชื่อผู้ใช้', 'ชื่อบัญชี', 'บัญชีผู้ใช้'],
  first_name: ['first name', 'firstname', 'given name', 'name', 'ชื่อ', 'ชื่อจริง'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'นามสกุล'],
  password: ['password', 'pass', 'pwd', 'passwd', 'รหัสผ่าน'],
  email: ['email', 'e mail', 'mail', 'อีเมล', 'อีเมล์'],
  team: ['team', 'team code', 'ทีม', 'รหัสทีม'],
  ip: ['ip', 'ip address', 'ips', 'ip addresses', 'subnet', 'ไอพี'],
  hidden: ['hidden', 'hide', 'ซ่อน'],
  unrestricted: ['unrestricted', 'no limits'],
  extra_time: ['extra time', 'extra', 'extra seconds', 'เวลาเพิ่ม', 'เวลาพิเศษ'],
  timezone: ['timezone', 'time zone', 'tz', 'เขตเวลา'],
  languages: ['languages', 'language', 'preferred languages', 'lang', 'ภาษา'],
};

export function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, '').trim().toLowerCase().replace(/[\s_\-.]+/g, ' ').trim();
}

export function guessField(header: string): ImportField | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  for (const field of IMPORT_FIELDS) {
    if (h === field.replace(/_/g, ' ') || ALIASES[field].includes(h)) return field;
  }
  return null;
}

/**
 * Decide whether the first row is a header and map each column to a field.
 * Without a header, columns follow the documented order.
 */
export function guessMapping(firstRow: readonly string[]): { hasHeader: boolean; mapping: Array<ImportField | null> } {
  const guessed = firstRow.map(guessField);
  if (guessed.some((g) => g !== null)) {
    const used = new Set<ImportField>();
    return {
      hasHeader: true,
      mapping: guessed.map((g) => {
        if (g === null || used.has(g)) return null;
        used.add(g);
        return g;
      }),
    };
  }
  return { hasHeader: false, mapping: firstRow.map((_, i) => IMPORT_FIELDS[i] ?? null) };
}
