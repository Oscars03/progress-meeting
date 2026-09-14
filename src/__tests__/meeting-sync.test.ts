/**
 * Tests for src/lib/google/meeting-sync.ts — the layer between the app's
 * meeting rows and Google Calendar events.
 *
 * The contract under test: calendar sync reports outcomes instead of throwing,
 * so a Google outage or expired token never fails the underlying action.
 * Every public function returns a SyncOutcome; nothing escapes as an exception.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  fetchEvent: vi.fn(),
  getStoredToken: vi.fn(),
  sheetFind: vi.fn(),
  sheetUpdate: vi.fn(),
}));

vi.mock('../lib/google/calendar', () => {
  class NotConnectedError extends Error {
    key: string;
    constructor(userId: string) {
      super(`User ${userId} has not connected Google Calendar`);
      this.name = 'NotConnectedError';
      this.key = 'calendar.notConnected';
    }
  }
  return {
    createEvent: mocks.createEvent,
    updateEvent: mocks.updateEvent,
    deleteEvent: mocks.deleteEvent,
    fetchEvent: mocks.fetchEvent,
    NotConnectedError,
  };
});

vi.mock('../lib/google/tokens', () => ({
  getStoredToken: mocks.getStoredToken,
}));

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: mocks.sheetFind,
    update: mocks.sheetUpdate,
  },
}));

/* ------------------------------------------------------------------ */
/* Module under test (loaded after mocks are in place)                */
/* ------------------------------------------------------------------ */

const { pushMeeting, pullMeeting, removeMeetingEvent } = await import(
  '../lib/google/meeting-sync'
);

/* ------------------------------------------------------------------ */
/* Seed helpers                                                       */
/* ------------------------------------------------------------------ */

const tables: Record<string, Record<string, unknown>[]> = {};

function seedMeeting(overrides: Record<string, unknown> = {}) {
  tables.meetings = [
    {
      id: 'm1',
      title: 'Weekly Progress',
      start_at: '2026-09-28T03:00:00.000Z',
      end_at: '2026-09-28T04:00:00.000Z',
      location: 'Room 101',
      meet_link: '',
      notes: '',
      status: 'scheduled',
      owner_id: 'user1',
      google_event_id: '',
      google_calendar_owner_id: '',
      google_synced_at: '',
      row_version: 1,
      ...overrides,
    },
  ];
  tables.users = [
    { id: 'user1', name: 'Alice', email: 'alice@test.com', active: true },
    { id: 'user2', name: 'Bob', email: 'bob@test.com', active: true },
    { id: 'inactive1', name: 'Charlie', email: 'charlie@test.com', active: false },
  ];
}

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(tables)) delete tables[key];

  mocks.sheetFind.mockImplementation(async (table: string) => tables[table] ?? []);
  mocks.sheetUpdate.mockResolvedValue({});
  mocks.getStoredToken.mockResolvedValue({ refreshToken: 'fake-token' });
});

/* ------------------------------------------------------------------ */
/* pushMeeting                                                        */
/* ------------------------------------------------------------------ */

describe('pushMeeting', () => {
  it('creates a Google event and records the event id', async () => {
    seedMeeting();
    mocks.createEvent.mockResolvedValue({ eventId: 'evt1', htmlLink: 'https://cal.google.com/...' });

    const result = await pushMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: true, action: 'created', eventId: 'evt1' });
    expect(mocks.sheetUpdate).toHaveBeenCalledWith(
      'meetings',
      'm1',
      expect.objectContaining({ google_event_id: 'evt1', google_calendar_owner_id: 'user1' }),
      1,
      'user1'
    );
  });

  it('updates an existing event when google_event_id is already set', async () => {
    seedMeeting({ google_event_id: 'evt1', google_calendar_owner_id: 'user1' });
    mocks.updateEvent.mockResolvedValue(undefined);

    const result = await pushMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: true, action: 'updated', eventId: 'evt1' });
    expect(mocks.updateEvent).toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('returns not-connected when the organiser has no stored token', async () => {
    seedMeeting();
    mocks.getStoredToken.mockResolvedValue(null);

    const result = await pushMeeting('m1', 'user1');

    expect(result).toMatchObject({
      ok: false,
      reason: 'not-connected',
      error: 'calendar.notConnected',
    });
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it('returns the owner-variant error when the calendar owner has no token', async () => {
    seedMeeting({ google_calendar_owner_id: 'owner1' });
    mocks.getStoredToken.mockResolvedValue(null);

    const result = await pushMeeting('m1', 'user1');

    expect(result).toMatchObject({
      ok: false,
      reason: 'not-connected',
      error: 'calendar.ownerNotConnected',
    });
  });

  it('returns an error outcome (never throws) when createEvent throws', async () => {
    seedMeeting();
    mocks.createEvent.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await pushMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });

  it('returns error.notFound when the meeting does not exist', async () => {
    seedMeeting();

    const result = await pushMeeting('nonexistent', 'user1');

    expect(result).toMatchObject({ ok: false, reason: 'error', error: 'error.notFound' });
  });

  it('invites only active users, excluding the organiser', async () => {
    seedMeeting();
    mocks.createEvent.mockResolvedValue({ eventId: 'evt1', htmlLink: null });

    await pushMeeting('m1', 'user1');

    // user1 is the organiser → excluded; inactive1 is not active → excluded
    expect(mocks.createEvent).toHaveBeenCalledWith(
      'user1',
      expect.objectContaining({ attendeeEmails: ['bob@test.com'] })
    );
  });
});

/* ------------------------------------------------------------------ */
/* pullMeeting                                                        */
/* ------------------------------------------------------------------ */

describe('pullMeeting', () => {
  it('updates meeting fields when the remote event changed', async () => {
    seedMeeting({
      google_event_id: 'evt1',
      google_calendar_owner_id: 'user1',
      title: 'Old Title',
    });
    mocks.fetchEvent.mockResolvedValue({
      id: 'evt1',
      title: 'New Title',
      startAt: '2026-09-28T03:00:00.000Z',
      endAt: '2026-09-28T04:00:00.000Z',
      location: 'Room 101',
      description: '',
      updatedAt: '2026-09-28T00:00:00.000Z',
      cancelled: false,
    });

    const result = await pullMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: true, action: 'updated', changed: ['title'] });
    expect(mocks.sheetUpdate).toHaveBeenCalledWith(
      'meetings',
      'm1',
      expect.objectContaining({ title: 'New Title' }),
      1,
      'user1'
    );
  });

  it('marks meeting cancelled when the event was deleted on Google', async () => {
    seedMeeting({ google_event_id: 'evt1', google_calendar_owner_id: 'user1' });
    mocks.fetchEvent.mockResolvedValue(null);

    const result = await pullMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: true, action: 'deleted', changed: ['status'] });
    expect(mocks.sheetUpdate).toHaveBeenCalledWith(
      'meetings',
      'm1',
      expect.objectContaining({ status: 'cancelled' }),
      1,
      'user1'
    );
  });

  it('returns not-linked when meeting has no google_event_id', async () => {
    seedMeeting();

    const result = await pullMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: false, reason: 'not-linked', error: 'sync.notLinked' });
  });

  it('returns an error outcome (never throws) when fetchEvent throws', async () => {
    seedMeeting({ google_event_id: 'evt1', google_calendar_owner_id: 'user1' });
    mocks.fetchEvent.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await pullMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });

  it('reports empty changed array when nothing differs', async () => {
    seedMeeting({
      google_event_id: 'evt1',
      google_calendar_owner_id: 'user1',
    });
    mocks.fetchEvent.mockResolvedValue({
      id: 'evt1',
      title: 'Weekly Progress',
      startAt: '2026-09-28T03:00:00.000Z',
      endAt: '2026-09-28T04:00:00.000Z',
      location: 'Room 101',
      description: '',
      updatedAt: '2026-09-28T00:00:00.000Z',
      cancelled: false,
    });

    const result = await pullMeeting('m1', 'user1');

    expect(result).toMatchObject({ ok: true, action: 'updated', changed: [] });
  });
});

/* ------------------------------------------------------------------ */
/* removeMeetingEvent                                                 */
/* ------------------------------------------------------------------ */

describe('removeMeetingEvent', () => {
  /** Build a meeting record with only the fields the function reads. */
  function meeting(overrides: Record<string, unknown> = {}) {
    return {
      id: 'm1',
      created_at: '',
      updated_at: '',
      created_by: '',
      title: '',
      start_at: '',
      end_at: '',
      location: '',
      meet_link: '',
      status: 'scheduled',
      recurrence_rule: '',
      owner_id: '',
      notes: '',
      google_event_id: 'evt1',
      google_calendar_owner_id: 'user1',
      google_synced_at: '',
      host_id: '',
      row_version: 1,
      ...overrides,
    };
  }

  it('deletes the event and clears the google fields', async () => {
    mocks.deleteEvent.mockResolvedValue(undefined);

    const result = await removeMeetingEvent(meeting(), 'user1');

    expect(result).toMatchObject({ ok: true, action: 'deleted', eventId: 'evt1' });
    expect(mocks.sheetUpdate).toHaveBeenCalledWith(
      'meetings',
      'm1',
      { google_event_id: '', google_calendar_owner_id: '', google_synced_at: '' },
      1,
      'user1'
    );
  });

  it('returns not-linked when meeting has no event id', async () => {
    const result = await removeMeetingEvent(
      meeting({ google_event_id: '', google_calendar_owner_id: '' }),
      'user1'
    );

    expect(result).toMatchObject({ ok: false, reason: 'not-linked', error: 'sync.noEvent' });
  });

  it('returns an error outcome (never throws) when deleteEvent throws', async () => {
    mocks.deleteEvent.mockRejectedValue(new Error('Internal Server Error'));

    const result = await removeMeetingEvent(meeting(), 'user1');

    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });
});
