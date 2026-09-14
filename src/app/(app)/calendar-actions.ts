'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { busyTimes, NotConnectedError } from '@/lib/google/calendar';
import { pullMeeting, pushMeeting } from '@/lib/google/meeting-sync';
import { disconnect, getStoredToken, getConnectedUserIds } from '@/lib/google/tokens';
import {
  addDays,
  buildWeekGrid,
  isIsoDate,
  labDate,
  mondayOf,
  slotStart,
  type AvailabilityDay,
  type Interval,
  type PersonAvailability,
} from '@/lib/availability-grid';
import { labInstant } from '@/lib/lab-time';
import { labMembers } from '@/lib/members';
import type { MeetingAttendeeRecord, MeetingRecord, UserRecord, PersonalEventRecord } from '@/lib/db/schema';

/**
 * The hours the grid covers each day, in the lab's zone. Kept in step with the
 * calendar's slotMinTime/slotMaxTime, so a time you can pick on one is a time
 * the other will show.
 */
const DAY_FROM_HOUR = 8;
const DAY_TO_HOUR = 22;

export type WeekAvailability = {
  weekStart: string;
  days: AvailabilityDay[];
  activeCount: number;
  /** Members who connected Google Calendar. */
  connectedCount: number;
  /** Of those, how many calendars were actually read this time. */
  readCount: number;
};

/**
 * Who is free, busy or unknown for every hour of a week.
 *
 * Two sources, both honest about what they cannot see:
 * - Google Calendar free/busy for members who connected it. Reading it
 *   successfully is the only thing that makes a person "known", because only
 *   then does an empty hour mean free.
 * - Meetings already in the app, for their owner and attendees. That can mark
 *   someone busy even without Google, but never free -- the app does not know
 *   the rest of their day.
 */
export async function weekAvailabilityAction(requestedWeek?: string): Promise<WeekAvailability> {
  await requireSession();

  const weekStart = mondayOf(isIsoDate(requestedWeek) ? requestedWeek : labDate(Date.now()));
  const windowStart = Date.parse(slotStart(weekStart, DAY_FROM_HOUR));
  const windowEnd = Date.parse(slotStart(addDays(weekStart, 6), DAY_TO_HOUR));

  const [users, connected, meetings, attendees, personalEvents] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    getConnectedUserIds(),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<MeetingAttendeeRecord>('meeting_attendees'),
    SheetRepo.find<PersonalEventRecord>('personal_events'),
  ]);

  const active = labMembers(users);

  const appBusy = new Map<string, Interval[]>();
  for (const meeting of meetings) {
    if (meeting.status === 'cancelled') continue;
    const start = Date.parse(meeting.start_at);
    const end = Date.parse(meeting.end_at);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    if (end <= windowStart || start >= windowEnd) continue;

    const ids = new Set(
      attendees
        // Someone marked absent or excused for this meeting is not held by it.
        .filter((a) => a.meeting_id === meeting.id && a.attend_status !== 'absent' && a.attend_status !== 'excused')
        .map((a) => a.user_id)
    );
    if (meeting.owner_id) ids.add(meeting.owner_id);

    for (const id of ids) {
      appBusy.set(id, [...(appBusy.get(id) ?? []), { start, end }]);
    }
  }

  // Hours a member blocked out by hand. `labInstant` reads both shapes these
  // rows come in: instants, and the bare wall clocks written before the create
  // action resolved the zone.
  for (const pe of personalEvents) {
    const start = labInstant(pe.start_at)?.getTime();
    const end = labInstant(pe.end_at)?.getTime();
    if (start === undefined || end === undefined || end <= start) continue;
    if (end <= windowStart || start >= windowEnd) continue;

    appBusy.set(pe.user_id, [...(appBusy.get(pe.user_id) ?? []), { start, end }]);
  }

  const timeMin = new Date(windowStart).toISOString();
  const timeMax = new Date(windowEnd).toISOString();

  // One free/busy call per connected member, in parallel. A revoked grant for
  // one person leaves them unknown rather than failing the whole grid.
  const google = await Promise.allSettled(
    active.map(async (u) => (connected.has(u.id) ? busyTimes(u.id, timeMin, timeMax) : null))
  );

  let readCount = 0;
  const people: PersonAvailability[] = active.map((u, i) => {
    const busy = [...(appBusy.get(u.id) ?? [])];
    const result = google[i];
    
    // User is "known" if they connected Google Calendar, OR if they added at least one manual event
    // somewhere in the database (Option B).
    const hasManualEvents = personalEvents.some(pe => pe.user_id === u.id);
    let known = hasManualEvents;

    if (result.status === 'fulfilled' && result.value) {
      for (const b of result.value) {
        const start = Date.parse(b.start);
        const end = Date.parse(b.end);
        if (!Number.isNaN(start) && !Number.isNaN(end)) busy.push({ start, end });
      }
      known = true;
      readCount++;
    } else if (result.status === 'rejected' && !(result.reason instanceof NotConnectedError)) {
      console.error(`freebusy failed for ${u.id}:`, result.reason);
    }

    return { id: u.id, name: u.name, known, busy };
  });

  return {
    weekStart,
    days: buildWeekGrid({ weekStart, fromHour: DAY_FROM_HOUR, toHour: DAY_TO_HOUR, people }),
    activeCount: active.length,
    connectedCount: active.filter((u) => connected.has(u.id)).length,
    readCount,
  };
}

export type ConnectionStatus = {
  connected: boolean;
  accountEmail: string;
  connectedAt: string;
  /**
   * Set when the connection existed and then broke -- a revoked grant, say.
   * "Not connected" alone reads as "never set up", which sends somebody
   * looking for a problem that is not there.
   */
  brokeWith: string;
};

export async function myCalendarStatusAction(): Promise<ConnectionStatus> {
  const actor = await requireSession();
  const stored = await getStoredToken(actor.id);
  return {
    connected: Boolean(stored),
    accountEmail: stored?.accountEmail ?? '',
    connectedAt: stored?.connectedAt ?? '',
    brokeWith: stored?.lastError ?? '',
  };
}

export async function disconnectCalendarAction(): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    await disconnect(actor.id);
    revalidatePath('/settings');
  });
}

export async function pushMeetingAction(meetingId: string) {
  const actor = await requireSession();
  const result = await pushMeeting(meetingId, actor.id);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
  return result;
}

export async function pullMeetingAction(meetingId: string) {
  const actor = await requireSession();
  const result = await pullMeeting(meetingId, actor.id);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
  return result;
}

export type SlotBusy = {
  slotId: string;
  /** Names of people whose calendar shows them busy for this slot. */
  busyNames: string[];
  /** How many people had a calendar we could actually read. */
  checked: number;
};

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const s1 = Date.parse(aStart);
  const e1 = Date.parse(aEnd);
  const s2 = Date.parse(bStart);
  const e2 = Date.parse(bEnd);
  if ([s1, e1, s2, e2].some(Number.isNaN)) return false;
  // Touching at the boundary is not a clash: a meeting ending at 11:00 does not
  // conflict with one starting at 11:00.
  return s1 < e2 && s2 < e1;
}

/**
 * Who is already busy for each proposed slot.
 *
 * Only people who connected their calendar are checked, and only busy/free is
 * read -- never what the clashing event is. Anybody not connected is simply
 * absent from the answer rather than assumed free, and `checked` says how many
 * calendars the answer is based on so the UI can be honest about its coverage.
 */
export async function slotConflictsAction(
  slots: { id: string; startAt: string; endAt: string }[]
): Promise<SlotBusy[]> {
  await requireSession();
  if (slots.length === 0) return [];

  const [users, connected, personalEvents] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    getConnectedUserIds(),
    SheetRepo.find<PersonalEventRecord>('personal_events'),
  ]);

  const candidates = labMembers(users).filter(
    (u) => connected.has(u.id) || personalEvents.some((pe) => pe.user_id === u.id)
  );
  const empty = slots.map((s) => ({ slotId: s.id, busyNames: [], checked: 0 }));
  if (candidates.length === 0) return empty;

  const starts = slots.map((s) => Date.parse(s.startAt)).filter((n) => !Number.isNaN(n));
  const ends = slots.map((s) => Date.parse(s.endAt)).filter((n) => !Number.isNaN(n));
  if (starts.length === 0 || ends.length === 0) return empty;

  const timeMin = new Date(Math.min(...starts)).toISOString();
  const timeMax = new Date(Math.max(...ends)).toISOString();

  const byName = new Map<string, { start: string; end: string }[]>();
  let checked = 0;

  // One freebusy call per person rather than per slot: the window covers every
  // slot, so a second call would ask the same question again.
  for (const user of candidates) {
    let busy: { start: string; end: string }[] = [];
    
    // 1. Google Calendar busy times
    if (connected.has(user.id)) {
      try {
        busy = await busyTimes(user.id, timeMin, timeMax);
        checked++;
      } catch (err) {
        if (!(err instanceof NotConnectedError)) {
          console.error(`freebusy failed for ${user.id}:`, err);
        }
      }
    } else {
      // Manual schedule user
      checked++;
    }

    // 2. Personal manual events
    const manualBusy = personalEvents
      .filter((pe) => pe.user_id === user.id)
      .map((pe) => ({ start: pe.start_at, end: pe.end_at }));

    byName.set(user.name, [...busy, ...manualBusy]);
  }

  return slots.map((slot) => ({
    slotId: slot.id,
    checked,
    busyNames: [...byName.entries()]
      .filter(([, intervals]) =>
        intervals.some((i) => overlaps(slot.startAt, slot.endAt, i.start, i.end))
      )
      .map(([name]) => name),
  }));
}
