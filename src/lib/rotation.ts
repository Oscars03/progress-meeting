/**
 * Whose turn it is to run the weekly meeting.
 *
 * One student each week prepares the meeting and writes the summary, and the
 * duty loops over the students. Professors sit outside the loop: they attend
 * every week, so taking a turn would mean never handing it on.
 *
 * The duty belongs to the **week**, not to a meeting. It is settled before
 * anything is scheduled, and a week that never got a meeting still used up
 * somebody's turn -- so `week_leads` is the record, and a meeting is not
 * required for one to exist.
 *
 * Nothing here reads the sheet. The turn is *suggested* from the weeks already
 * assigned, and only becomes real when someone confirms it, so a suggestion is
 * never mistaken for a decision.
 */

import type { MeetingRecord, UserRecord, WeekLeadRecord } from './db/schema';
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

function orderOf(user: UserRecord): number {
  const n = Number(user.rotation_order);
  // Anyone never placed queues after everyone who was, rather than at the front.
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/**
 * Active students in the order the duty loops: the order an admin arranged in
 * Settings, with anyone unplaced following in join order.
 */
export function rotationMembers(users: UserRecord[]): UserRecord[] {
  return users
    .filter((user) => user.active === true && !OUTSIDE_ROTATION.has(user.role))
    .sort((a, b) => {
      const byOrder = orderOf(a) - orderOf(b);
      if (byOrder !== 0) return byOrder;
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });
}

/** The confirmed lead for one ISO week, or null while it is only suggested. */
export function leadForWeek(leads: WeekLeadRecord[], key: string): WeekLeadRecord | null {
  return leads.find((lead) => lead.week_key === key) ?? null;
}

/** Whether `userId` holds the duty for one ISO week. */
export function isWeekLead(leads: WeekLeadRecord[], key: string, userId: string): boolean {
  const lead = leadForWeek(leads, key);
  return Boolean(lead && userId && lead.user_id === userId);
}

/** Every week `userId` holds, for a UI that has to judge several at once. */
export function weeksLedBy(leads: WeekLeadRecord[], userId: string): string[] {
  return userId ? leads.filter((lead) => lead.user_id === userId).map((lead) => lead.week_key) : [];
}

/** The most recently assigned week, or null when none has been. */
function latestLead(leads: WeekLeadRecord[]): WeekLeadRecord | null {
  let latest: WeekLeadRecord | null = null;

  for (const lead of leads) {
    if (!lead.user_id || !lead.week_key) continue;
    // ISO week keys sort correctly as plain strings: 2026-W07 < 2026-W38.
    if (!latest || lead.week_key > latest.week_key) latest = lead;
  }

  return latest;
}

/**
 * Whose turn it is: the next student after whoever held the most recent week,
 * wrapping at the end of the list.
 *
 * The arranged order *is* the rotation, so this steps through it rather than
 * asking who has waited longest. Someone who leaves the list simply drops out
 * of it, and the step lands on whoever now occupies the following position.
 * Null when there are no students.
 */
export function suggestNextHost(
  users: UserRecord[],
  leads: WeekLeadRecord[],
): UserRecord | null {
  const members = rotationMembers(users);
  if (members.length === 0) return null;

  const latest = latestLead(leads);
  if (!latest) return members[0];

  const held = members.findIndex((member) => member.id === latest.user_id);
  // A lead who has since left the rotation gives no position to step from.
  if (held === -1) return members[0];

  return members[(held + 1) % members.length];
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
