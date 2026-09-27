import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AUDIT_MAX_ENTRIES, appendAuditEntry, auditToCsv, clearAudit, readAudit } from '@/core/audit';
import { csvCell, toCsv } from '@/core/csv';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny', 5, null]])).toBe('"a,b","say ""hi""","x\ny",5,\r\n');
  });
  it('neutralises spreadsheet formulas in text but not numbers', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('สมชาย')).toBe('สมชาย');
  });
});

describe('audit log', () => {
  beforeEach(() => fakeBrowser.reset());

  it('appends, reads back, clears', async () => {
    await appendAuditEntry({ time: 1, action: 'Bulk extra time', contestId: 1, targets: ['stu001', 'stu002'], result: 'ok' });
    await appendAuditEntry({ time: 2, action: 'Message', contestId: 1, targets: ['stu003'], result: 'failed', details: 'HTTP 403' });
    expect((await readAudit()).map((e) => e.action)).toEqual(['Bulk extra time', 'Message']);
    await clearAudit();
    expect(await readAudit()).toEqual([]);
  });

  it(`keeps only the newest ${AUDIT_MAX_ENTRIES} entries`, async () => {
    const many = Array.from({ length: AUDIT_MAX_ENTRIES }, (_, i) => ({
      time: i,
      action: 'x',
      contestId: null,
      targets: [],
      result: 'ok' as const,
    }));
    await fakeBrowser.storage.local.set({ audit: many });
    await appendAuditEntry({ time: 99999, action: 'last', contestId: null, targets: [], result: 'ok' });
    const entries = await readAudit();
    expect(entries).toHaveLength(AUDIT_MAX_ENTRIES);
    expect(entries[0]!.time).toBe(1);
    expect(entries.at(-1)!.action).toBe('last');
  });

  it('exports CSV with UTC times', () => {
    const csv = auditToCsv([
      { time: Date.UTC(2026, 9, 4, 2, 0, 0), action: 'Announcement', contestId: 1, targets: ['all'], result: 'ok', details: '30 minutes left' },
    ]);
    expect(csv).toBe(
      'time_utc,action,contest_id,targets,result,details\r\n2026-10-04T02:00:00.000Z,Announcement,1,all,ok,30 minutes left\r\n',
    );
  });
});
