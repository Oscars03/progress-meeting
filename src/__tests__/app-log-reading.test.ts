/**
 * Everything that reads the app log back or puts a name on a row: what
 * toResult records, which rows the daily trim takes, what Settings → Logs
 * counts, and how a cookie becomes a user id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encode } from 'next-auth/jwt';
import type { AppLogRecord } from '../lib/db/schema';

const logEvent = vi.fn();
const logError = vi.fn();

vi.mock('../lib/app-log', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/app-log')>()),
  logEvent,
  logError,
}));
vi.mock('../lib/request-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/request-context')>()),
  requestContext: async () => ({ userId: 'u-7', path: '/tasks' }),
}));

const { toResult } = await import('../lib/action-result');
const { UserError } = await import('../lib/user-error');
const { ConflictError } = await import('../lib/db/sheet-repo');
const { expiredLogRows, KEEP_DAYS } = await import('../lib/app-log-retention');
const { filterLog, formatLogDetail, readableLogRows, summarizeLog } = await import('../lib/app-log-view');
const { parseCookies, userIdFromCookieHeader } = await import('../lib/request-context');

beforeEach(() => {
  logEvent.mockReset();
  logError.mockReset();
});

describe('toResult', () => {
  it('records a refusal as a warning, with who and where', async () => {
    const res = await toResult(async () => {
      throw new ConflictError('Row changed by someone else (expected version 3, now 4)');
    });

    expect(res).toEqual({ ok: false, error: 'error.conflict', vars: undefined });
    expect(logEvent).toHaveBeenCalledWith({
      level: 'warn',
      event: 'action_refused',
      message: 'error.conflict',
      userId: 'u-7',
      path: '/tasks',
      detail: { reason: 'Row changed by someone else (expected version 3, now 4)' },
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps the vars a refusal was given', async () => {
    await toResult(async () => {
      throw new UserError('error.invalidValue', { value: 'x' });
    });
    expect(logEvent.mock.calls[0][0].detail).toEqual({ vars: { value: 'x' } });
  });

  it('records anything else as an error, and still answers generically', async () => {
    const boom = new TypeError("Cannot read properties of undefined (reading 'id')");
    const res = await toResult(async () => {
      throw boom;
    });

    expect(res).toEqual({ ok: false, error: 'error.generic' });
    expect(logError).toHaveBeenCalledWith('action_failed', boom, {
      message: 'server action failed',
      userId: 'u-7',
      path: '/tasks',
    });
  });

  it('records nothing when the action worked', async () => {
    expect(await toResult(async () => ({ id: 'x' }))).toEqual({ ok: true, id: 'x' });
    expect(logEvent).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('expiredLogRows', () => {
  const now = Date.parse('2026-10-21T00:00:00.000Z');
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();
  const header = ['id', 'created_at', 'updated_at', 'row_version', 'created_by', 'level'];
  const row = (at: string, level: string) => ['x', at, at, '1', 'system', level];

  it('takes page views after a month and errors only after half a year', () => {
    const rows = [
      header,
      row(daysAgo(KEEP_DAYS.info + 1), 'info'), // 1: gone
      row(daysAgo(KEEP_DAYS.info - 1), 'info'), // 2: kept
      row(daysAgo(KEEP_DAYS.info + 1), 'error'), // 3: kept
      row(daysAgo(KEEP_DAYS.error + 1), 'error'), // 4: gone
      row(daysAgo(KEEP_DAYS.warn + 1), 'warn'), // 5: gone
      row(daysAgo(KEEP_DAYS.info + 1), 'warn'), // 6: kept
    ];
    expect(expiredLogRows(rows, now)).toEqual([1, 4, 5]);
  });

  it('keeps a row whose date it cannot read, and one at a level it does not know', () => {
    const rows = [header, row('not a date', 'info'), row(daysAgo(KEEP_DAYS.info + 1), 'mystery')];
    expect(expiredLogRows(rows, now)).toEqual([]);
  });

  it('never takes the header, and does nothing with an empty tab', () => {
    expect(expiredLogRows([header], now)).toEqual([]);
    expect(expiredLogRows([], now)).toEqual([]);
  });
});

describe('reading the log on Settings → Logs', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z');
  const entry = (over: Partial<AppLogRecord>): AppLogRecord => ({
    id: Math.random().toString(36),
    created_at: '2026-10-21T10:00:00.000Z',
    updated_at: '',
    row_version: 1,
    created_by: '',
    level: 'info',
    event: 'view',
    user_id: '',
    path: '',
    message: '',
    detail: '',
    ...over,
  });

  const rows = [
    entry({ level: 'error', event: 'server_error', user_id: 'u-1', created_at: '2026-10-21T09:00:00.000Z' }),
    entry({ level: 'warn', event: 'action_refused', user_id: 'u-2', created_at: '2026-10-21T08:00:00.000Z' }),
    entry({ event: 'view', user_id: 'u-1', created_at: '2026-10-21T11:00:00.000Z' }),
    entry({ event: 'view', user_id: 'u-3' }),
    entry({ level: 'warn', event: 'sign_in_failed', user_id: 'u-9' }),
    entry({ level: 'error', event: 'server_error', user_id: 'u-1', created_at: '2026-09-01T00:00:00.000Z' }),
  ];

  it('counts the last seven days, and not somebody who only failed to sign in', () => {
    expect(summarizeLog(rows, now)).toEqual({ errors: 1, warnings: 2, views: 2, people: 3 });
  });

  it('filters by level and by person, newest first', () => {
    expect(filterLog(rows, { level: 'error', userId: '' }).map((r) => r.created_at)).toEqual([
      '2026-10-21T09:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]);
    expect(filterLog(rows, { level: 'all', userId: 'u-1' }).map((r) => r.event)).toEqual([
      'view',
      'server_error',
      'server_error',
    ]);
  });

  it('shows a stack as lines, whichever shape the detail arrived in', () => {
    const detail = { error: { stack: 'Error: boom\n    at page.tsx:3' } };
    expect(formatLogDetail(detail)).toContain('Error: boom\n    at page.tsx:3');
    expect(formatLogDetail(JSON.stringify(detail))).toContain('Error: boom\n    at page.tsx:3');
    expect(formatLogDetail('not json')).toBe('not json');
    expect(formatLogDetail('')).toBe('');
  });

  it('gives back a message that looks like JSON as the text it was written as', () => {
    // What SheetRepo hands back for a cell holding '{"status":500}', '[1,2]' or 'TRUE'.
    const read = readableLogRows([
      entry({ message: { status: 500 } as unknown as string }),
      entry({ message: [1, 2] as unknown as string }),
      entry({ message: true as unknown as string, path: undefined as unknown as string }),
    ]);
    expect(read.map((r) => r.message)).toEqual(['{"status":500}', '[1,2]', 'TRUE']);
    expect(read[2].path).toBe('');
  });
});

describe('a user id from the Cookie header', () => {
  it('parses cookies, decoding values', () => {
    expect(parseCookies('a=1; b=hello%20there;c')).toEqual({ a: '1', b: 'hello there' });
    expect(parseCookies('')).toEqual({});
  });

  it('reads the id out of a NextAuth session cookie', async () => {
    process.env.NEXTAUTH_SECRET = 'a-test-secret-that-is-long-enough';
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL;
    const token = await encode({ token: { id: 'u-42' }, secret: process.env.NEXTAUTH_SECRET });

    expect(await userIdFromCookieHeader(`wpm.locale=th; next-auth.session-token=${token}`)).toBe('u-42');
  });

  it('answers empty for no cookie, or one that does not decode', async () => {
    expect(await userIdFromCookieHeader('')).toBe('');
    expect(await userIdFromCookieHeader('next-auth.session-token=garbage')).toBe('');
  });
});
