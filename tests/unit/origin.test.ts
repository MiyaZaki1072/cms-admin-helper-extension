import { describe, expect, it } from 'vitest';
import { isPrivateHost, parseAwsUrl } from '@/core/origin';

describe('parseAwsUrl', () => {
  it('adds http:// and a trailing slash', () => {
    expect(parseAwsUrl('localhost:8889')).toEqual({
      base: 'http://localhost:8889/',
      permissionPattern: 'http://localhost:8889/*',
      matchPattern: 'http://localhost:8889/*',
    });
  });

  it('keeps a path prefix for the content script but not for the permission', () => {
    expect(parseAwsUrl(' https://contest.example.org/aws ')).toEqual({
      base: 'https://contest.example.org/aws/',
      permissionPattern: 'https://contest.example.org/*',
      matchPattern: 'https://contest.example.org/aws/*',
    });
  });

  it('drops the default port', () => {
    expect(parseAwsUrl('http://10.0.0.5:80/').base).toBe('http://10.0.0.5/');
  });

  it('rejects empty, non-http and credential URLs', () => {
    expect(() => parseAwsUrl('   ')).toThrow(/Enter the AWS address/);
    expect(() => parseAwsUrl('ftp://host')).toThrow(/http/);
    expect(() => parseAwsUrl('http://admin:pw@host')).toThrow(/username or password/);
    expect(() => parseAwsUrl('http://')).toThrow(/not a valid address/);
  });
});

describe('isPrivateHost', () => {
  it.each(['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', 'judge.local'])('%s is private', (h) => {
    expect(isPrivateHost(h)).toBe(true);
  });
  it.each(['8.8.8.8', '172.32.0.1', 'cms.example.org'])('%s is public', (h) => {
    expect(isPrivateHost(h)).toBe(false);
  });
});
