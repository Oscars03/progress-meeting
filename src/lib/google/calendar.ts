import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { getStoredToken, recordTokenError } from './tokens';
import { UserError } from '../user-error';

/**
 * Google Calendar access on behalf of a signed-in person.
 *
 * This deliberately does not use the service account. A service account is its
 * own identity with its own empty calendar; it cannot see or write anyone's
 * personal calendar unless that calendar is explicitly shared with it. Reading
 * a member's busy times and putting an event on their calendar is something
 * only they can authorise, so every call here runs as a specific user.
 */

export class NotConnectedError extends UserError {
  constructor(userId: string) {
    super('calendar.notConnected', undefined, `User ${userId} has not connected Google Calendar`);
    this.name = 'NotConnectedError';
  }
}

/** The calendar the person sees as theirs. */
export const PRIMARY = 'primary';

// ponytail: per-process cache only. On Vercel each instance caches its own
// clients — acceptable because the alternative is a fresh token exchange every
// single call (+200-500ms). TTL 50 min < Google's 60 min access token lifetime.
const CLIENT_TTL = 50 * 60 * 1000;
const clientCache = new Map<string, { calendar: calendar_v3.Calendar; ts: number }>();

async function clientFor(userId: string) {
  const cached = clientCache.get(userId);
  if (cached && Date.now() - cached.ts < CLIENT_TTL) {
    return { calendar: cached.calendar };
  }

  const stored = await getStoredToken(userId);
  if (!stored) throw new NotConnectedError(userId);

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: stored.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth });
  clientCache.set(userId, { calendar, ts: Date.now() });
  return { calendar, stored };
}

/**
 * Run a calendar call as `userId`, recording an authorisation failure against
 * their connection so the UI can tell them to reconnect.
 *
 * A revoked or expired grant comes back as invalid_grant. That is a permanent
 * state -- retrying never fixes it -- so it is stored rather than swallowed.
 */
async function asUser<T>(
  userId: string,
  work: (calendar: calendar_v3.Calendar) => Promise<T>
): Promise<T> {
  const { calendar } = await clientFor(userId);
  try {
    return await work(calendar);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/invalid_grant|unauthorized|invalid credentials/i.test(message)) {
      clientCache.delete(userId);
      await recordTokenError(userId, message);
    }
    throw err;
  }
}

export type BusyInterval = { start: string; end: string };

/**
 * Busy intervals for one person between two instants.
 *
 * freebusy returns only busy/free, never event titles, so this reads the least
 * it can to answer "can they make it" -- a colleague's calendar contents are
 * not the app's business.
 */
export async function busyTimes(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<BusyInterval[]> {
  return asUser(userId, async (calendar) => {
    const res = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: [{ id: PRIMARY }] },
    });
    const busy = res.data.calendars?.[PRIMARY]?.busy ?? [];
    return busy
      .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
      .map((b) => ({ start: b.start, end: b.end }));
  });
}

export type GoogleEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Google's own colour for the event, when its owner set one. */
  colorId?: string;
};

/**
 * Fetch the user's actual events with titles for their personal view.
 */
export async function myEvents(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  return asUser(userId, async (calendar) => {
    const res = await calendar.events.list({
      calendarId: PRIMARY,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return (res.data.items || [])
      .filter((e) => e.start?.dateTime || e.start?.date)
      .map((e) => ({
        id: e.id || Math.random().toString(),
        title: e.summary || 'Busy',
        start: (e.start?.dateTime || e.start?.date) as string,
        end: (e.end?.dateTime || e.end?.date) as string,
        // Only set when the person coloured the event by hand; most carry
        // none and take their calendar's default.
        colorId: e.colorId ?? '',
      }));
  });
}

export type EventInput = {
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt: string;
  /** Invited addresses. Google mails them and puts it on their calendar. */
  attendeeEmails: string[];
};

/**
 * Create the event on `organiserUserId`'s calendar and invite the rest.
 *
 * Inviting is what reaches people who never connected their account: Google
 * delivers the invitation and it lands on their calendar without this app ever
 * holding a token for them. Writing to each person's calendar individually
 * would need a grant from every one of them and would still leave duplicates
 * when somebody is invited twice.
 */
export async function createEvent(
  organiserUserId: string,
  input: EventInput
): Promise<{ eventId: string; htmlLink: string | null }> {
  return asUser(organiserUserId, async (calendar) => {
    const res = await calendar.events.insert({
      calendarId: PRIMARY,
      sendUpdates: 'all',
      requestBody: {
        summary: input.title,
        description: input.description || undefined,
        location: input.location || undefined,
        start: { dateTime: new Date(input.startAt).toISOString() },
        end: { dateTime: new Date(input.endAt).toISOString() },
        attendees: input.attendeeEmails.map((email) => ({ email })),
      },
    });

    const eventId = res.data.id;
    if (!eventId) throw new Error('Google returned no event id');
    return { eventId, htmlLink: res.data.htmlLink ?? null };
  });
}

export async function updateEvent(
  organiserUserId: string,
  eventId: string,
  input: EventInput
): Promise<void> {
  await asUser(organiserUserId, async (calendar) => {
    await calendar.events.patch({
      calendarId: PRIMARY,
      eventId,
      sendUpdates: 'all',
      requestBody: {
        summary: input.title,
        description: input.description || undefined,
        location: input.location || undefined,
        start: { dateTime: new Date(input.startAt).toISOString() },
        end: { dateTime: new Date(input.endAt).toISOString() },
        attendees: input.attendeeEmails.map((email) => ({ email })),
      },
    });
  });
}

export async function deleteEvent(organiserUserId: string, eventId: string): Promise<void> {
  await asUser(organiserUserId, async (calendar) => {
    try {
      await calendar.events.delete({ calendarId: PRIMARY, eventId, sendUpdates: 'all' });
    } catch (err) {
      // Already gone from Google's side is the state we wanted anyway.
      const message = err instanceof Error ? err.message : String(err);
      if (!/not found|deleted|410|404/i.test(message)) throw err;
    }
  });
}

export type RemoteEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  updatedAt: string;
  cancelled: boolean;
};

/** Read one event back, for pulling calendar-side edits into the app. */
export async function fetchEvent(
  organiserUserId: string,
  eventId: string
): Promise<RemoteEvent | null> {
  return asUser(organiserUserId, async (calendar) => {
    try {
      const res = await calendar.events.get({ calendarId: PRIMARY, eventId });
      const e = res.data;
      const start = e.start?.dateTime ?? e.start?.date ?? '';
      const end = e.end?.dateTime ?? e.end?.date ?? '';
      return {
        id: e.id ?? eventId,
        title: e.summary ?? '',
        description: e.description ?? '',
        location: e.location ?? '',
        startAt: start,
        endAt: end,
        updatedAt: e.updated ?? '',
        cancelled: e.status === 'cancelled',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found|404|410/i.test(message)) return null;
      throw err;
    }
  });
}
