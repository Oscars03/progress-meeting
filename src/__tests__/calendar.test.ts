/**
 * Lower-level tests for src/lib/google/calendar.ts.
 *
 * The public functions are tested through mocked googleapis and tokens modules.
 * The contract under test: the `asUser` wrapper records auth errors via
 * `recordTokenError`, and each CRUD function handles Google's error semantics
 * correctly (404 on delete is swallowed, 404 on fetch returns null, missing
 * token throws NotConnectedError, etc.).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const gcal = vi.hoisted(() => ({
  freebusyQuery: vi.fn(),
  eventsInsert: vi.fn(),
  eventsDelete: vi.fn(),
  eventsGet: vi.fn(),
}));

const tokens = vi.hoisted(() => ({
  getStoredToken: vi.fn(),
  recordTokenError: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    calendar: () => ({
      freebusy: { query: gcal.freebusyQuery },
      events: {
        insert: gcal.eventsInsert,
        delete: gcal.eventsDelete,
        get: gcal.eventsGet,
      },
    }),
  },
}));

vi.mock('../lib/google/tokens', () => ({
  getStoredToken: tokens.getStoredToken,
  recordTokenError: tokens.recordTokenError,
}));

/* ------------------------------------------------------------------ */
/* Module under test (loaded after mocks are in place)                */
/* ------------------------------------------------------------------ */

const { busyTimes, createEvent, deleteEvent, fetchEvent, NotConnectedError } =
  await import('../lib/google/calendar');
const { forgetClient } = await import('../lib/google/client-cache');

const STORED = { refreshToken: 'fake-token' };

beforeEach(() => {
  vi.clearAllMocks();
  tokens.getStoredToken.mockResolvedValue(STORED);
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('connection check', () => {
  it('busyTimes throws NotConnectedError when getStoredToken returns null', async () => {
    tokens.getStoredToken.mockResolvedValue(null);

    await expect(
      busyTimes('user1', '2026-09-01T00:00:00Z', '2026-09-07T00:00:00Z')
    ).rejects.toThrow(NotConnectedError);
  });

  it('createEvent throws NotConnectedError when getStoredToken returns null', async () => {
    tokens.getStoredToken.mockResolvedValue(null);

    await expect(
      createEvent('user1', {
        title: 'Test',
        startAt: '2026-09-28T03:00:00.000Z',
        endAt: '2026-09-28T04:00:00.000Z',
        attendeeEmails: [],
      })
    ).rejects.toThrow(NotConnectedError);
  });
});

describe('auth error recording', () => {
  it('records token error on invalid_grant and re-throws', async () => {
    gcal.freebusyQuery.mockRejectedValue(new Error('invalid_grant'));

    await expect(
      busyTimes('user1', '2026-09-01T00:00:00Z', '2026-09-07T00:00:00Z')
    ).rejects.toThrow('invalid_grant');

    expect(tokens.recordTokenError).toHaveBeenCalledWith('user1', 'invalid_grant');
  });

  it('does not record token error for a non-auth error', async () => {
    gcal.freebusyQuery.mockRejectedValue(new Error('network timeout'));

    await expect(
      busyTimes('user1', '2026-09-01T00:00:00Z', '2026-09-07T00:00:00Z')
    ).rejects.toThrow('network timeout');

    expect(tokens.recordTokenError).not.toHaveBeenCalled();
  });
});

describe('deleteEvent error handling', () => {
  it('swallows a 404 (already gone is the state we wanted)', async () => {
    gcal.eventsDelete.mockRejectedValue(new Error('Not Found 404'));

    await expect(deleteEvent('user1', 'evt1')).resolves.toBeUndefined();
  });

  it('re-throws a non-404 error', async () => {
    gcal.eventsDelete.mockRejectedValue(new Error('Internal Server Error'));

    await expect(deleteEvent('user1', 'evt1')).rejects.toThrow('Internal Server Error');
  });
});

describe('fetchEvent error handling', () => {
  it('returns null for a 404 instead of throwing', async () => {
    gcal.eventsGet.mockRejectedValue(new Error('Not Found 404'));

    const result = await fetchEvent('user1', 'evt1');
    expect(result).toBeNull();
  });

  it('re-throws a non-404 error', async () => {
    gcal.eventsGet.mockRejectedValue(new Error('Internal Server Error'));

    await expect(fetchEvent('user1', 'evt1')).rejects.toThrow('Internal Server Error');
  });
});

/**
 * A client is kept so a run of calls does not pay for a token exchange each
 * time. The price is that the stored token is no longer consulted on every
 * call, so anything that changes it has to say so -- see the disconnect test
 * in tokens.test.ts.
 */
describe('client cache', () => {
  const WINDOW = ['2026-09-01T00:00:00Z', '2026-09-07T00:00:00Z'] as const;

  it('reuses a client, and builds a new one once the connection is forgotten', async () => {
    forgetClient('cache-user');
    gcal.freebusyQuery.mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });

    await busyTimes('cache-user', ...WINDOW);
    expect(tokens.getStoredToken).toHaveBeenCalledTimes(1);

    await busyTimes('cache-user', ...WINDOW);
    expect(tokens.getStoredToken).toHaveBeenCalledTimes(1);

    forgetClient('cache-user');
    await busyTimes('cache-user', ...WINDOW);
    expect(tokens.getStoredToken).toHaveBeenCalledTimes(2);
  });

  it('stops serving a cached client once the grant is rejected', async () => {
    forgetClient('revoked-user');
    gcal.freebusyQuery.mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });
    await busyTimes('revoked-user', ...WINDOW);

    gcal.freebusyQuery.mockRejectedValue(new Error('invalid_grant'));
    await expect(busyTimes('revoked-user', ...WINDOW)).rejects.toThrow('invalid_grant');

    // The grant is gone, so the next call must go back to the token store --
    // which is where "not connected" is decided.
    tokens.getStoredToken.mockResolvedValue(null);
    await expect(busyTimes('revoked-user', ...WINDOW)).rejects.toThrow(NotConnectedError);
  });
});

describe('createEvent validation', () => {
  it('rejects when Google returns no event id', async () => {
    gcal.eventsInsert.mockResolvedValue({ data: { id: null, htmlLink: null } });

    await expect(
      createEvent('user1', {
        title: 'Test',
        startAt: '2026-09-28T03:00:00.000Z',
        endAt: '2026-09-28T04:00:00.000Z',
        attendeeEmails: [],
      })
    ).rejects.toThrow('Google returned no event id');
  });
});
