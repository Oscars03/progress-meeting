/**
 * The app log: what a row looks like, what is never copied into one, and how
 * rows reach the sheet -- together, spaced out, and never at the cost of the
 * request that produced them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SCHEMAS } from '../lib/db/schema';

const append = vi.fn();
const update = vi.fn();
const batchUpdate = vi.fn();

vi.mock('../lib/db/sheet-client', () => ({
  getSheetsApi: async () => ({
    spreadsheets: { values: { append, update }, batchUpdate },
  }),
  getSpreadsheetId: () => 'sheet-1',
}));

const {
  describeError,
  flushAppLog,
  logError,
  logEvent,
  pathOnly,
  requestFlush,
  resetAppLog,
  toLogRow,
} = await import('../lib/app-log');

const column = (name: string) => (SCHEMAS.app_log as readonly string[]).indexOf(name);

/** Every row appended so far, across every call. */
function appendedRows(): string[][] {
  return append.mock.calls.flatMap(([params]) => params.requestBody.values as string[][]);
}

beforeEach(() => {
  resetAppLog();
  append.mockReset().mockResolvedValue({});
  update.mockReset().mockResolvedValue({});
  batchUpdate.mockReset().mockResolvedValue({});
  process.env.SPREADSHEET_ID = 'sheet-1';
  process.env.SERVICE_ACCOUNT_JSON = '{}';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.SPREADSHEET_ID;
  delete process.env.SERVICE_ACCOUNT_JSON;
});

describe('a log row', () => {
  it('fills every column in the order the tab has them', () => {
    const row = toLogRow(
      {
        level: 'error',
        event: 'server_error',
        message: 'boom',
        userId: 'u-1',
        path: 'https://host/tasks?id=3',
        detail: { routeType: 'render' },
      },
      new Date('2026-10-21T03:00:00.000Z')
    );

    expect(row).toHaveLength(SCHEMAS.app_log.length);
    expect(row[column('created_at')]).toBe('2026-10-21T03:00:00.000Z');
    expect(row[column('row_version')]).toBe('1');
    expect(row[column('created_by')]).toBe('u-1');
    expect(row[column('level')]).toBe('error');
    expect(row[column('event')]).toBe('server_error');
    expect(row[column('user_id')]).toBe('u-1');
    expect(row[column('path')]).toBe('/tasks');
    expect(row[column('message')]).toBe('boom');
    expect(JSON.parse(row[column('detail')])).toEqual({ routeType: 'render' });
  });

  it('names nobody as system, and leaves an empty detail empty', () => {
    const row = toLogRow({ level: 'info', event: 'view' });
    expect(row[column('created_by')]).toBe('system');
    expect(row[column('user_id')]).toBe('');
    expect(row[column('detail')]).toBe('');
  });

  it('cuts a message down rather than overflowing the cell', () => {
    const row = toLogRow({ level: 'error', event: 'x', message: 'a'.repeat(5_000) });
    expect(row[column('message')].length).toBeLessThanOrEqual(1_000);
  });
});

describe('pathOnly', () => {
  it('keeps the path and drops the query and the host', () => {
    expect(pathOnly('https://irish-progress.vercel.app/meetings/abc?tab=2#x')).toBe('/meetings/abc');
    expect(pathOnly('/tasks?mine=1')).toBe('/tasks');
    expect(pathOnly('')).toBe('');
    expect(pathOnly(null)).toBe('');
  });
});

describe('describeError', () => {
  it('keeps the name, message, stack, digest, code and cause', () => {
    const cause = new Error('socket hang up');
    const error = Object.assign(new Error('Sheets said no', { cause }), {
      digest: 'abc123',
      code: 429,
      status: 429,
    });

    const out = describeError(error);
    expect(out).toMatchObject({
      name: 'Error',
      message: 'Sheets said no',
      digest: 'abc123',
      code: 429,
      status: 429,
      cause: { message: 'socket hang up' },
    });
    expect(String(out.stack)).toContain('Sheets said no');
  });

  it('never copies the request a Google error carries -- its headers hold the access token', () => {
    const error = Object.assign(new Error('Request failed'), {
      config: { headers: { Authorization: 'Bearer ya29.secret' } },
      response: { config: { headers: { Authorization: 'Bearer ya29.secret' } } },
    });

    expect(JSON.stringify(describeError(error))).not.toContain('ya29.secret');
  });

  it('describes things thrown that are not errors', () => {
    expect(describeError('plain string')).toEqual({ message: 'plain string' });
    expect(describeError({ message: 'shaped like one' })).toEqual({ message: 'shaped like one' });
    expect(describeError(undefined)).toEqual({ message: 'undefined' });
  });
});

describe('writing to the sheet', () => {
  it('writes nothing when there is no sheet configured', async () => {
    delete process.env.SPREADSHEET_ID;
    logEvent({ level: 'error', event: 'server_error', message: 'x' });
    await flushAppLog();
    expect(append).not.toHaveBeenCalled();
  });

  it('sends page views together in one append, after a short wait', async () => {
    vi.useFakeTimers();
    logEvent({ level: 'info', event: 'view', userId: 'u-1', path: '/dashboard' });
    logEvent({ level: 'info', event: 'view', userId: 'u-2', path: '/tasks' });
    logEvent({ level: 'info', event: 'view', userId: 'u-1', path: '/meetings' });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(append).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(append).toHaveBeenCalledTimes(1);
    expect(appendedRows().map((r) => r[column('path')])).toEqual(['/dashboard', '/tasks', '/meetings']);
  });

  it('writes as raw text, so a message beginning with = is not a formula', async () => {
    logEvent({ level: 'error', event: 'client_error', message: '=HYPERLINK("http://evil")' });
    await requestFlush(0);
    expect(append.mock.calls[0][0]).toMatchObject({
      range: 'app_log!A1',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
    });
  });

  it('does not make an error wait out the page-view delay', async () => {
    vi.useFakeTimers();
    logEvent({ level: 'info', event: 'view', path: '/dashboard' });
    logEvent({ level: 'error', event: 'server_error', message: 'boom' });

    await vi.advanceTimersByTimeAsync(0);
    expect(append).toHaveBeenCalledTimes(1);
    // Whatever was already waiting goes with it.
    expect(appendedRows()).toHaveLength(2);
  });

  it('keeps appends at least five seconds apart, even for errors', async () => {
    vi.useFakeTimers();
    logEvent({ level: 'error', event: 'server_error', message: 'one' });
    await vi.advanceTimersByTimeAsync(0);
    expect(append).toHaveBeenCalledTimes(1);

    logEvent({ level: 'error', event: 'server_error', message: 'two' });
    logEvent({ level: 'error', event: 'server_error', message: 'three' });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(append).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[1][0].requestBody.values).toHaveLength(2);
  });

  it('stores at most sixty of one event a minute', async () => {
    for (let i = 0; i < 100; i++) logEvent({ level: 'warn', event: 'sign_in_failed', message: String(i) });
    logEvent({ level: 'warn', event: 'action_refused', message: 'a different event still gets in' });
    await flushAppLog();

    const rows = appendedRows();
    expect(rows.filter((r) => r[column('event')] === 'sign_in_failed')).toHaveLength(60);
    expect(rows.filter((r) => r[column('event')] === 'action_refused')).toHaveLength(1);
  });

  it('stores at most five thousand of one event a day, however the minutes are spread', async () => {
    vi.useFakeTimers();
    for (let minute = 0; minute < 100; minute++) {
      for (let i = 0; i < 60; i++) logEvent({ level: 'error', event: 'client_error', message: 'junk' });
      await vi.advanceTimersByTimeAsync(60_000);
    }
    await flushAppLog();
    expect(appendedRows()).toHaveLength(5_000);
  });

  it('creates the tab when the sheet does not have one yet, then writes', async () => {
    append
      .mockRejectedValueOnce(Object.assign(new Error('Unable to parse range: app_log!A1'), { code: 400 }))
      .mockResolvedValueOnce({});

    logEvent({ level: 'error', event: 'server_error', message: 'first after a release' });
    await flushAppLog();

    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { requests: [{ addSheet: { properties: { title: 'app_log' } } }] },
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'app_log!1:1', requestBody: { values: [[...SCHEMAS.app_log]] } })
    );
    expect(append).toHaveBeenCalledTimes(2);
  });

  it('gives up quietly when the sheet refuses, and stays usable', async () => {
    append.mockRejectedValueOnce(Object.assign(new Error('Quota exceeded'), { code: 429 }));
    logEvent({ level: 'error', event: 'server_error', message: 'lost' });
    await expect(flushAppLog()).resolves.toBeUndefined();

    logEvent({ level: 'error', event: 'server_error', message: 'kept' });
    await flushAppLog();
    // The refused rows are dropped, not sent again with the next ones.
    const last = append.mock.calls.at(-1)![0].requestBody.values as string[][];
    expect(last.map((r) => r[column('message')])).toEqual(['kept']);
  });
});

describe('logError', () => {
  it('prints as console.error did, and stores the error with its stack', async () => {
    const error = new Error('calendar refused');
    logError('google_calendar', error, { message: 'calendar sync failed', userId: 'u-1' });
    await flushAppLog();

    expect(console.error).toHaveBeenCalledWith('calendar sync failed:', error);
    const row = appendedRows()[0];
    expect(row[column('level')]).toBe('error');
    expect(row[column('message')]).toBe('calendar sync failed: calendar refused');
    expect(JSON.parse(row[column('detail')]).error.stack).toContain('calendar refused');
  });

  it('prints nothing when asked to be quiet', () => {
    logError('server_error', new Error('Next printed this already'), { quiet: true });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('can record a warning', async () => {
    logError('sign_in_retry', new Error('busy'), { level: 'warn' });
    await flushAppLog();
    expect(console.warn).toHaveBeenCalled();
    expect(appendedRows()[0][column('level')]).toBe('warn');
  });
});
