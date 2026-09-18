import { SheetRepo } from '@/lib/db/sheet-repo';
import { labMembers } from '@/lib/members';
import type { MeetingRecord, UserRecord } from '@/lib/db/schema';
import {
  createEvent,
  deleteEvent,
  fetchEvent,
  updateEvent,
  NotConnectedError,
  type EventInput,
} from './calendar';
import { getStoredToken } from './tokens';
import type { TranslationKey } from '../ui/i18n';

/**
 * Keeping a meeting row and a Google Calendar event in step.
 *
 * Calendar sync is an enhancement layered on the sheet, never a requirement of
 * it. Every function here reports what happened instead of throwing on a
 * missing connection: a meeting that cannot be pushed to Google is still a
 * meeting, and failing the save would make the calendar an outage surface for
 * the core app.
 */

export type SyncOutcome =
  | { ok: true; eventId: string; action: 'created' | 'updated' | 'deleted' }
  | {
      ok: false;
      reason: 'not-connected' | 'not-linked' | 'error';
      /** A message key; the page translates it for the reader. */
      error: TranslationKey;
    };

/** Meeting fields a pull can change, named for the page to translate. */
export type SyncField = 'title' | 'start' | 'end' | 'location' | 'status';

/**
 * Emails to invite: the lab's members, minus blanks and duplicates.
 *
 * Members, not "everyone active". Admin is a system account rather than
 * somebody who attends -- it takes no turn, its free time is not weighed when
 * finding a slot, and it is not asked to confirm one. Putting it on the
 * invitation contradicted all of that: an account that had no say in the time
 * was sent the appointment anyway, and with two admin accounts on this
 * spreadsheet that is two invitations nobody wanted.
 *
 * `excludeUserId` is the organiser, who is on their own event already.
 */
async function attendeeEmails(excludeUserId?: string): Promise<string[]> {
  const users = await SheetRepo.find<UserRecord>('users');
  const seen = new Set<string>();
  for (const u of labMembers(users)) {
    if (excludeUserId && u.id === excludeUserId) continue;
    const email = (u.email ?? '').trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}

function eventInputFrom(meeting: MeetingRecord, emails: string[]): EventInput {
  const parts = [meeting.notes, meeting.meet_link].filter(Boolean);
  return {
    title: meeting.title,
    description: parts.join('\n\n'),
    location: meeting.location ?? '',
    startAt: meeting.start_at,
    endAt: meeting.end_at,
    attendeeEmails: emails,
  };
}

/** Google's own error text stays in the server log; the page gets a key. */
function failed(err: unknown): TranslationKey {
  console.error('calendar sync failed:', err);
  return 'sync.failed';
}

/**
 * Push a meeting to Google as `organiserUserId`, creating or updating the event.
 *
 * The organiser is whoever is acting, not a fixed account -- the roadmap asked
 * that anybody be able to schedule. Once an event exists it stays on its
 * original organiser's calendar, because moving an event between calendars
 * means deleting and recreating it, which re-notifies everybody.
 */
export async function pushMeeting(
  meetingId: string,
  organiserUserId: string
): Promise<SyncOutcome> {
  const meetings = await SheetRepo.find<MeetingRecord>('meetings');
  const meeting = meetings.find((m) => m.id === meetingId);
  if (!meeting) return { ok: false, reason: 'error', error: 'error.notFound' };

  const owner = meeting.google_calendar_owner_id || organiserUserId;

  if (!(await getStoredToken(owner))) {
    return {
      ok: false,
      reason: 'not-connected',
      error: owner === organiserUserId ? 'calendar.notConnected' : 'calendar.ownerNotConnected',
    };
  }

  const emails = await attendeeEmails(owner);

  try {
    if (meeting.google_event_id) {
      await updateEvent(owner, meeting.google_event_id, eventInputFrom(meeting, emails));
      await SheetRepo.update<MeetingRecord>(
        'meetings',
        meeting.id,
        { google_synced_at: new Date().toISOString() },
        meeting.row_version,
        organiserUserId
      );
      return { ok: true, eventId: meeting.google_event_id, action: 'updated' };
    }

    const { eventId } = await createEvent(owner, eventInputFrom(meeting, emails));
    await SheetRepo.update<MeetingRecord>(
      'meetings',
      meeting.id,
      {
        google_event_id: eventId,
        google_calendar_owner_id: owner,
        google_synced_at: new Date().toISOString(),
      },
      meeting.row_version,
      organiserUserId
    );
    return { ok: true, eventId, action: 'created' };
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return { ok: false, reason: 'not-connected', error: err.key };
    }
    return { ok: false, reason: 'error', error: failed(err) };
  }
}

/**
 * Pull calendar-side edits back into the meeting row.
 *
 * This is the inbound half of two-way sync. Without a public callback URL there
 * is nothing for Google to notify, so it runs when somebody asks for it rather
 * than on a change. A cancelled event marks the meeting cancelled instead of
 * deleting the row, because minutes and action items hang off it.
 */
export async function pullMeeting(
  meetingId: string,
  actorUserId: string
): Promise<SyncOutcome & { changed?: SyncField[] }> {
  const meetings = await SheetRepo.find<MeetingRecord>('meetings');
  const meeting = meetings.find((m) => m.id === meetingId);
  if (!meeting) return { ok: false, reason: 'error', error: 'error.notFound' };

  if (!meeting.google_event_id || !meeting.google_calendar_owner_id) {
    return { ok: false, reason: 'not-linked', error: 'sync.notLinked' };
  }

  try {
    const remote = await fetchEvent(meeting.google_calendar_owner_id, meeting.google_event_id);

    if (!remote) {
      await SheetRepo.update<MeetingRecord>(
        'meetings',
        meeting.id,
        { status: 'cancelled', google_synced_at: new Date().toISOString() },
        meeting.row_version,
        actorUserId
      );
      return {
        ok: true,
        eventId: meeting.google_event_id,
        action: 'deleted',
        changed: ['status'],
      };
    }

    const patch: Record<string, string> = {};
    const changed: SyncField[] = [];

    if (remote.title && remote.title !== meeting.title) {
      patch.title = remote.title;
      changed.push('title');
    }
    if (remote.startAt && new Date(remote.startAt).toISOString() !== meeting.start_at) {
      patch.start_at = new Date(remote.startAt).toISOString();
      changed.push('start');
    }
    if (remote.endAt && new Date(remote.endAt).toISOString() !== meeting.end_at) {
      patch.end_at = new Date(remote.endAt).toISOString();
      changed.push('end');
    }
    if (remote.location !== meeting.location) {
      patch.location = remote.location;
      changed.push('location');
    }
    if (remote.cancelled && meeting.status !== 'cancelled') {
      patch.status = 'cancelled';
      changed.push('status');
    }

    patch.google_synced_at = new Date().toISOString();

    await SheetRepo.update<MeetingRecord>(
      'meetings',
      meeting.id,
      patch,
      meeting.row_version,
      actorUserId
    );

    return { ok: true, eventId: meeting.google_event_id, action: 'updated', changed };
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return { ok: false, reason: 'not-connected', error: err.key };
    }
    return { ok: false, reason: 'error', error: failed(err) };
  }
}

/** Remove the Google event when a meeting is cancelled in the app. */
export async function removeMeetingEvent(
  meeting: MeetingRecord,
  actorUserId: string
): Promise<SyncOutcome> {
  if (!meeting.google_event_id || !meeting.google_calendar_owner_id) {
    return { ok: false, reason: 'not-linked', error: 'sync.noEvent' };
  }
  try {
    await deleteEvent(meeting.google_calendar_owner_id, meeting.google_event_id);
    await SheetRepo.update<MeetingRecord>(
      'meetings',
      meeting.id,
      { google_event_id: '', google_calendar_owner_id: '', google_synced_at: '' },
      meeting.row_version,
      actorUserId
    );
    return { ok: true, eventId: meeting.google_event_id, action: 'deleted' };
  } catch (err) {
    if (err instanceof NotConnectedError) {
      return { ok: false, reason: 'not-connected', error: err.key };
    }
    return { ok: false, reason: 'error', error: failed(err) };
  }
}
