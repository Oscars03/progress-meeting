/**
 * Whose turn it is to run the weekly meeting.
 *
 * One student each week prepares the meeting and writes the summary, and the
 * duty loops over the students. Professors sit outside the loop: they attend
 * every week, so taking a turn would mean never handing it on.
 *
 * Nothing here reads the sheet. The turn is *suggested* from the meetings that
 * already record a host, and only becomes real when someone confirms it and a
 * host_id is written -- so a suggestion never silently becomes a fact.
 */

import type { MeetingRecord, UserRecord } from './db/schema';
import { weekKey } from './week';

/**
 * Roles that never take a turn: professors advise rather than report, `admin`
 * is a system account, and a viewer is a guest. Written as an exclusion so a
 * new student role joins the rotation by default rather than by being
 * remembered here.
 */
const OUTSIDE_ROTATION = new Set(['professor', 'admin', 'viewer']);

function isCancelled(meeting: MeetingRecord): boolean {
  return meeting.status === 'cancelled';
}

/** Active students, in the order they joined -- the order the duty loops in. */
export function rotationMembers(users: UserRecord[]): UserRecord[] {
  return users
    .filter((user) => user.active === true && !OUTSIDE_ROTATION.has(user.role))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/**
 * When each student last held the duty, by user id.
 *
 * A meeting still in the future counts: someone already booked for next week
 * has their turn, and suggesting them again would double-book them.
 */
function lastHeldByUser(meetings: MeetingRecord[]): Map<string, string> {
  const last = new Map<string, string>();

  for (const meeting of meetings) {
    if (!meeting.host_id || isCancelled(meeting)) continue;
    const seen = last.get(meeting.host_id);
    if (!seen || meeting.start_at > seen) last.set(meeting.host_id, meeting.start_at);
  }

  return last;
}

/**
 * The student whose turn it is: whoever has gone longest without one, and
 * anyone who has never held it before that. Null when there are no students.
 *
 * Derived rather than stored, so someone joining or leaving changes the answer
 * without a pointer to migrate.
 */
export function suggestNextHost(
  users: UserRecord[],
  meetings: MeetingRecord[],
): UserRecord | null {
  const members = rotationMembers(users);
  if (members.length === 0) return null;

  const last = lastHeldByUser(meetings);

  // Join order already sorts the never-held group; a stable sort keeps it.
  return members
    .slice()
    .sort((a, b) => {
      const aLast = last.get(a.id);
      const bLast = last.get(b.id);
      if (!aLast && !bLast) return 0;
      if (!aLast) return -1;
      if (!bLast) return 1;
      return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
    })[0];
}

/** Meetings in the ISO week containing `date`, earliest first, cancelled ones dropped. */
export function meetingsInWeek(meetings: MeetingRecord[], date: Date = new Date()): MeetingRecord[] {
  const target = weekKey(date);

  return meetings
    .filter((meeting) => {
      if (!meeting.start_at || isCancelled(meeting)) return false;
      const start = new Date(meeting.start_at);
      return !Number.isNaN(start.getTime()) && weekKey(start) === target;
    })
    .sort((a, b) => (a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0));
}

/** The soonest meeting that has not started yet, or null when none is scheduled. */
export function nextMeeting(
  meetings: MeetingRecord[],
  now: Date = new Date(),
): MeetingRecord | null {
  const iso = now.toISOString();

  const upcoming = meetings
    .filter((meeting) => meeting.start_at && !isCancelled(meeting) && meeting.start_at >= iso)
    .sort((a, b) => (a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0));

  return upcoming[0] ?? null;
}
