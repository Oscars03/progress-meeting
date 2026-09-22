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
 * assigned, and only becomes real once it is confirmed -- by an admin, or by
 * itself once the grace period past the previous meeting has passed -- so a
 * suggestion is never mistaken for a decision. See `autoAssignWeekLead` in
 * meetings/actions.ts for the confirming-by-itself half.
 */

import type { MeetingRecord, TermBreakRecord, UserRecord, WeekLeadRecord } from './db/schema';
import { weekKey, nextWeekKey, weekStartDate } from './week';
import { labDay } from './lab-time';
import { breakForWeek } from './term-breaks';

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

/** Enough of the caller to answer the two questions below. */
type LeadActor = { id: string; previewingLead?: boolean };

/**
 * Whether this caller runs `week` -- including an admin looking through the
 * lead's eyes.
 *
 * Every page and every action asks this rather than `isWeekLead` directly, so
 * that the preview is coherent: a view that shows the lead's buttons and then
 * has the actions behind them refuse would be a worse lie than not offering
 * them at all.
 *
 * It grants nothing. Only a real admin can be previewing, and leading a week
 * is a subset of what an admin could already do -- so this can let an admin
 * act as a lead, never anybody else.
 *
 * Bounded to the current week on purpose: the preview answers "what does this
 * week's lead see", and is not a way to take over somebody else's week.
 */
export function actsAsWeekLead(
  actor: LeadActor,
  leads: WeekLeadRecord[],
  week: string
): boolean {
  if (isWeekLead(leads, week, actor.id)) return true;
  return Boolean(actor.previewingLead) && week === weekKey();
}

/** The weeks this caller runs, with the previewed one folded in. */
export function weeksRunBy(actor: LeadActor, leads: WeekLeadRecord[]): string[] {
  const held = weeksLedBy(leads, actor.id);
  if (!actor.previewingLead) return held;

  const current = weekKey();
  return held.includes(current) ? held : [...held, current];
}

/**
 * Whether this caller runs this week or one still to come.
 *
 * For wording, not for rights: the actions still ask actsAsWeekLead about the
 * week in hand. A week led months ago does not make someone the person who
 * schedules the next meeting, so it should not change what their buttons say.
 */
export function leadsCurrentOrLater(actor: LeadActor, leads: WeekLeadRecord[]): boolean {
  const now = weekKey();
  return weeksRunBy(actor, leads).some((week) => week >= now);
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

/** One week of the rotation as the calendar shows it. */
export type WeekLeadPlan = {
  week_key: string;
  /** The Monday that starts it, YYYY-MM-DD -- what the calendar matches on. */
  monday: string;
  /** Null for a break week, or a week before the rotation that nobody held. */
  user_id: string | null;
  name: string | null;
  /** True when `week_leads` records it; false when it is where the order lands. */
  confirmed: boolean;
  /** The term break covering the week, when it is one. */
  break_name: string | null;
};

/**
 * Who holds each of `count` weeks from `fromKey` on: the confirmed lead where
 * there is one, and after the last confirmed week, the arranged order carried
 * forward one student per week.
 *
 * Walks exactly the way the weeks get confirmed -- `suggestNextHost` from the
 * most recent lead, and `autoAssignWeekLead` passing over a break week -- so
 * what the calendar says ahead of time is what happens when the week arrives.
 * A break week holds nobody and uses up nobody's turn.
 *
 * A week at or before the last confirmed one that has no lead stays empty
 * rather than being filled in: it was passed over, and guessing a name for it
 * would claim a turn that was never taken.
 */
export function planWeekLeads(
  users: UserRecord[],
  leads: WeekLeadRecord[],
  breaks: TermBreakRecord[],
  fromKey: string,
  count: number
): WeekLeadPlan[] {
  const names = new Map(users.map((u) => [u.id, u.name]));
  const assigned = leads.filter((lead) => lead.user_id && lead.week_key);
  const plan: WeekLeadPlan[] = [];

  // Stepped forward from the latest confirmed week, as one more row each time.
  const walked = [...assigned];
  let latest = latestLead(assigned)?.week_key ?? '';

  // Any confirmed weeks between the latest and `fromKey` are already in
  // `walked`, so a start further ahead than them still counts from them.
  let key = fromKey;
  if (latest && latest < fromKey) {
    for (let k = nextWeekKey(latest); k < fromKey; k = nextWeekKey(k)) {
      if (breakForWeek(breaks, k)) continue;
      const next = suggestNextHost(users, walked);
      if (!next) break;
      walked.push({ week_key: k, user_id: next.id } as WeekLeadRecord);
      latest = k;
    }
  }

  for (let i = 0; i < count; i++, key = nextWeekKey(key)) {
    const monday = weekStartDate(key) ?? '';
    const brk = breakForWeek(breaks, key);
    const row: WeekLeadPlan = {
      week_key: key,
      monday,
      user_id: null,
      name: null,
      confirmed: false,
      break_name: brk?.name ?? null,
    };

    const held = leadForWeek(assigned, key);
    if (held) {
      row.user_id = held.user_id;
      row.name = names.get(held.user_id) ?? null;
      row.confirmed = true;
    } else if (!brk && (!latest || key > latest)) {
      const next = suggestNextHost(users, walked);
      if (next) {
        walked.push({ week_key: key, user_id: next.id } as WeekLeadRecord);
        latest = key;
        row.user_id = next.id;
        row.name = next.name;
      }
    }

    plan.push(row);
  }

  return plan;
}

/**
 * The week whose duty and board should be showing right now.
 *
 * Ordinarily just the plain calendar week -- but a full lab day after a
 * week's meeting ends, its business is done, and sitting on it until the
 * next ISO week starts (which may be days away, since meetings are booked ad
 * hoc rather than on a fixed weekday) makes the app look stale the moment
 * everyone still cares about what's next. So this moves on a day early,
 * anchored to the meeting that just finished rather than to the clock.
 *
 * Only ever moves forward from the calendar week, never behind it: a week
 * with no meeting, or one still to come, is unaffected.
 */
export function activeWeekKey(meetings: MeetingRecord[], now: Date = new Date()): string {
  const today = labDay(now);
  let active = weekKey(now);

  for (const meeting of meetings) {
    if (isCancelled(meeting) || !meeting.start_at || !meeting.end_at) continue;

    const ended = new Date(meeting.end_at);
    // Still within the grace day, or not even over yet.
    if (Number.isNaN(ended.getTime()) || labDay(ended) >= today) continue;

    const rolled = nextWeekKey(weekKey(new Date(meeting.start_at)));
    if (rolled > active) active = rolled;
  }

  return active;
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
