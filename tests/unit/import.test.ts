import { describe, expect, it } from 'vitest';
import { guessMapping } from '@/features/import/fields';
import { expandPattern, parseText } from '@/features/import/parse';
import { generatePassword } from '@/features/import/passwords';
import { type ServerState, planImport } from '@/features/import/plan';
import { checkIpList, parseBool, validateRows } from '@/features/import/validate';

const HEADER = 'username,first_name,last_name,password,email,team,ip,hidden,unrestricted,extra_time,timezone,languages';

describe('parsing', () => {
  it('reads CSV with quoted commas', () => {
    expect(parseText(`${HEADER}\nstu002,Malee,Srisuk,MyPass!23,,BKK01,10.0.0.12,false,false,600,Asia/Bangkok,"th,en"\n\n`)).toEqual([
      HEADER.split(','),
      ['stu002', 'Malee', 'Srisuk', 'MyPass!23', '', 'BKK01', '10.0.0.12', 'false', 'false', '600', 'Asia/Bangkok', 'th,en'],
    ]);
  });
  it('reads a tab-separated paste from a spreadsheet', () => {
    expect(parseText('User\tชื่อ\tนามสกุล\nstu001\tสมชาย\tใจดี\n')).toEqual([
      ['User', 'ชื่อ', 'นามสกุล'],
      ['stu001', 'สมชาย', 'ใจดี'],
    ]);
  });
  it('reads semicolons (Excel in some locales) and drops a BOM', () => {
    expect(parseText('﻿username;team\nstu001;BKK01')).toEqual([
      ['username', 'team'],
      ['stu001', 'BKK01'],
    ]);
  });
});

describe('column mapping', () => {
  it('matches English and Thai headers loosely', () => {
    expect(guessMapping(['User', 'ชื่อ', 'นามสกุล', 'E-mail', 'Team Code', 'Something else'])).toEqual({
      hasHeader: true,
      mapping: ['username', 'first_name', 'last_name', 'email', 'team', null],
    });
  });
  it('falls back to the documented column order without a header', () => {
    expect(guessMapping(['stu001', 'Somchai', 'Jaidee'])).toEqual({ hasHeader: false, mapping: ['username', 'first_name', 'last_name'] });
  });
  it('maps a repeated header only once', () => {
    expect(guessMapping(['username', 'user']).mapping).toEqual(['username', null]);
  });
});

describe('patterns', () => {
  it('expands with zero padding', () => {
    const r = expandPattern('stu{001..120}');
    expect(r.ok && [r.names.length, r.names[0], r.names[119]]).toEqual([120, 'stu001', 'stu120']);
  });
  it('without padding and with a suffix', () => {
    const r = expandPattern('t{8..10}-a');
    expect(r.ok && r.names).toEqual(['t8-a', 't9-a', 't10-a']);
  });
  it('rejects bad patterns', () => {
    expect(expandPattern('stu').ok).toBe(false);
    expect(expandPattern('stu{5..1}').ok).toBe(false);
    expect(expandPattern('u{1..5000}').ok).toBe(false);
  });
});

describe('validation', () => {
  it('IP lists like CMS parses them', () => {
    expect(checkIpList('10.0.0.12, 192.168.1.0/24')).toEqual(['10.0.0.12, 192.168.1.0/24', []]);
    expect(checkIpList('999.1.1.1')[1][0]).toMatch(/not an IPv4 address/);
    expect(checkIpList('10.0.0.5/24')[1][0]).toMatch(/host bits set.*did you mean 10\.0\.0\.0\/24/);
    expect(checkIpList('10.0.0.0/33')[1][0]).toMatch(/prefix/);
    expect(checkIpList('fe80::1, 2001:db8::/32')[1]).toEqual([]);
    expect(checkIpList('')).toEqual(['', []]);
  });
  it('booleans', () => {
    expect(['true', 'Yes', '1', 'x'].map(parseBool)).toEqual([true, true, true, true]);
    expect(['', 'false', 'no', '0'].map(parseBool)).toEqual([false, false, false, false]);
    expect(parseBool('maybe')).toBeNull();
  });
  it('every rule, and duplicates flagged on each occurrence', () => {
    const table = parseText(`${HEADER}
ok001,A,B,,a@b.co,BKK01,10.0.0.1,yes,no,10m,Asia/Bangkok,"th,en"
dup,A,B,,,,,,,,,
dup,C,D,,,,,,,,,
,No,Name,,,,,,,,,
has space,A,B,,,,,,,,,
bad001,A,B,,not-an-email,,,,,,,
bad002,A,B,,,,,maybe,,,,
bad003,A,B,,,,,,,soon,,
bad004,A,B,,,,,,,,Mars/Base,
bad005,A,B,,,,,,,,,english
bad006,A,B,,,BKK 01,,,,,,`);
    const rows = validateRows(table, guessMapping(table[0]!).mapping, true);
    const byLine = Object.fromEntries(rows.map((r) => [r.line, r]));
    expect(byLine[2]).toMatchObject({ username: 'ok001', errors: [], hidden: true, unrestricted: false, extraTime: 600, languages: ['th', 'en'] });
    expect(byLine[3]!.errors).toEqual(['Username appears 2 times (lines 3, 4)']);
    expect(byLine[4]!.errors).toEqual(['Username appears 2 times (lines 3, 4)']);
    expect(byLine[5]!.errors).toEqual(['Username is empty']);
    expect(byLine[6]!.errors[0]).toMatch(/letters, digits/);
    expect(byLine[7]!.errors[0]).toMatch(/not an email/);
    expect(byLine[8]!.errors[0]).toMatch(/hidden must be true\/false/);
    expect(byLine[9]!.errors[0]).toMatch(/not a duration/);
    expect(byLine[10]!.errors[0]).toMatch(/not a timezone/);
    expect(byLine[11]!.errors[0]).toMatch(/language code "english"/);
    expect(byLine[12]!.errors[0]).toMatch(/contains spaces/);
  });
});

describe('passwords', () => {
  it('word-digits, from crypto randomness', () => {
    expect(generatePassword()).toMatch(/^[a-z]+-\d{4}$/);
    expect(generatePassword(6)).toMatch(/^[a-z]+-\d{6}$/);
    const many = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(many.size).toBeGreaterThan(190);
  });
  it('is deterministic with an injected random source', () => {
    expect(generatePassword(4, () => 0)).toBe('apple-0000');
  });
});

describe('import plan', () => {
  const server: ServerState = {
    users: new Map([
      ['stu001', { id: 1, username: 'stu001', firstName: 'Arthit', lastName: 'Srisuk' }],
      ['guest01', { id: 51, username: 'guest01', firstName: 'Guest', lastName: 'Account' }],
      ['Mixed', { id: 60, username: 'Mixed', firstName: '', lastName: '' }],
    ]),
    participantIds: new Set([1]),
    teamCodes: new Set(['BKK01']),
  };
  it('new, add to contest, skip, error; new teams; generated passwords', () => {
    const table = parseText(`username,first_name,password,team,ip
new001,Somchai,,BKK01,
new002,Malee,MyPass!23,NEWTEAM,
stu001,Arthit,,,
guest01,Someone,secret,,
mixed,X,,,
bad,X,,OTHER,10.0.0.5/24`);
    const plan = planImport(validateRows(table, guessMapping(table[0]!).mapping, true), server, { method: 'bcrypt', passwordDigits: 4 }, () => 'gen-1234');
    expect(plan.rows.map((r) => [r.username, r.status])).toEqual([
      ['new001', 'new'],
      ['new002', 'new'],
      ['stu001', 'skip'],
      ['guest01', 'add'],
      ['mixed', 'new'],
      ['bad', 'error'],
    ]);
    expect(plan.rows[0]).toMatchObject({ password: 'gen-1234', passwordGenerated: true });
    expect(plan.rows[1]).toMatchObject({ password: 'MyPass!23', passwordGenerated: false, newTeam: true });
    expect(plan.rows[3]!.warnings.join(' ')).toMatch(/Password ignored.*different first name/);
    expect(plan.rows[4]!.warnings[0]).toMatch(/"Mixed", which differs only in case/);
    expect(plan.newTeams).toEqual(['NEWTEAM']);
    expect(plan.counts).toEqual({ new: 3, add: 1, skip: 1, error: 1 });
  });
});
