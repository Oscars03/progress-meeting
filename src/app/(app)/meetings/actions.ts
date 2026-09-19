'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { actsAsWeekLead, rotationMembers } from '@/lib/rotation';
import { labDay, labInstant } from '@/lib/lab-time';
import { weekKey } from '@/lib/week';
import { pushMeeting, removeMeetingEvent } from '@/lib/google/meeting-sync';
import type {
  ActionItemRecord,
  AvailabilityPollRecord,
  MeetingAttendeeRecord,
  MeetingRecord,
  MinutesRecord,
  TermBreakRecord,
  TopicRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { breakCovering, breakForWeek } from '@/lib/term-breaks';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Book a meeting directly, without asking anyone.
 *
 * Admin only, and deliberately so: the way a meeting is meant to come about is
 * a poll -- propose times, everyone answers, the winning slot becomes the
 * meeting. This skips all of that, so it is the escape hatch rather than the
 * route, and the button for it is not shown to anyone else.
 */
export async function createMeeting(data: {
  title: string;
  start_at: string;
  end_at: string;
  location?: string;
  meet_link?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

    const title = data.title?.trim();
    if (!title) throw new UserError('meetings.topicRequired');
    if (!data.start_at || !data.end_at) throw new UserError('meetings.timesRequired');

    // A datetime-local carries no zone, so these are read as Thailand rather
    // than as the server's UTC -- 08:00 typed here means 08:00 here.
    const start = labInstant(data.start_at);
    const end = labInstant(data.end_at);
    if (!start || !end) throw new UserError('error.dateInvalid');
    if (end <= start) throw new UserError('error.endBeforeStart');

    const breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
    const coveringBreak = breakCovering(breaks, labDay(start));
    if (coveringBreak) {
      throw new UserError('error.duringBreak', { name: coveringBreak.name });
    }

    const meetLink = data.meet_link?.trim() ?? '';
    if (meetLink && !isHttpUrl(meetLink)) {
      throw new UserError('meetings.linkInvalid');
    }

    await SheetRepo.insert(
      'meetings',
      {
        title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        location: data.location?.trim() ?? '',
        meet_link: meetLink,
        status: 'scheduled',
        recurrence_rule: '',
        owner_id: actor.id,
        notes: '',
      },
      actor.id
    );

    revalidatePath('/meetings');
    revalidatePath('/dashboard');
  });
}

/**
 * Move a confirmed meeting to a different time.
 *
 * Until now the only way to correct a booking was to delete it and start the
 * poll again, which throws away the minutes, the agenda and the attendance
 * along with the wrong hour. Nothing about the meeting changes here except
 * when it happens.
 *
 * Judged on the week, like deleting one: the lead owns their week's schedule
 * and admin can always step in. Both ends are checked, so a lead cannot push a
 * meeting out of their week and into somebody else's.
 */
export async function rescheduleMeetingAction(
  meetingId: string,
  data: { start_at: string; end_at: string },
  rowVersion: number,
  /**
   * Whether everybody invited is mailed about the move.
   *
   * Asked rather than assumed. Google mails on every patch unless told not
   * to, so correcting a time twice in a minute sent the lab two notices of a
   * meeting that had not started moving yet. Off unless the person says so.
   */
  notify = false
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const meeting = await SheetRepo.findOne<MeetingRecord>('meetings', meetingId);
    if (!meeting) throw new UserError('error.notFound');

    // Bare wall clocks from the form, read as Thailand -- the same rule as
    // everywhere else a time is typed in.
    const start = labInstant(data.start_at);
    const end = labInstant(data.end_at);
    if (!start || !end) throw new UserError('error.dateInvalid');
    if (end <= start) throw new UserError('error.endBeforeStart');

    if (actor.role !== 'admin') {
      const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
      const wasAt = labInstant(meeting.start_at);
      const weeks = [wasAt ? weekKey(wasAt) : '', weekKey(start)];
      if (weeks.some((w) => !w || !actsAsWeekLead(actor, leads, w))) {
        throw new UserError('avail.leadOnly');
      }
    }

    const breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
    const coveringBreak = breakCovering(breaks, labDay(start));
    if (coveringBreak) throw new UserError('error.duringBreak', { name: coveringBreak.name });

    await SheetRepo.update<MeetingRecord>(
      'meetings',
      meetingId,
      { start_at: start.toISOString(), end_at: end.toISOString() },
      rowVersion,
      actor.id
    );

    // Best effort, and only for a meeting that already reached Google. A
    // calendar that refuses must not undo a move the app has accepted.
    if (meeting.google_event_id) {
      try {
        await pushMeeting(meetingId, actor.id, notify);
      } catch (err) {
        console.error('Could not move the Google event for this meeting:', err);
      }
    }

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/meetings/polls');
    revalidatePath('/dashboard');
  });
}

/**
 * Confirm who is responsible for a week.
 *
 * The duty is stored against the ISO week rather than a meeting, so it can be
 * settled before anything is scheduled -- and a week that never got a meeting
 * still records whose turn it was, which is what keeps the rotation honest.
 *
 * Passing an empty userId clears the week, so a wrong confirmation can be
 * undone without editing the sheet by hand.
 *
 * Admin settles it. This was professor-and-above, on the reading that naming
 * whose turn it is looks like an advisor's call; the rotation decides it
 * anyway, and what the app needs is one account that can correct a wrong
 * entry rather than a second opinion about the order.
 */
export async function setWeekLead(weekKey: string, userId: string): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

    if (!/^\d{4}-W\d{2}$/.test(weekKey)) {
      throw new UserError('error.invalidValue', { value: weekKey });
    }

    const breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
    const coveringBreak = breakForWeek(breaks, weekKey);
    if (coveringBreak) {
      throw new UserError('error.duringBreak', { name: coveringBreak.name });
    }

    if (userId) {
      const users = await SheetRepo.find<UserRecord>('users');
      const eligible = rotationMembers(users).some((student) => student.id === userId);
      if (!eligible) throw new UserError('rotation.notEligible');
    }

    // Read then write rather than taking a row_version from the client: the
    // caller holds a week, not a row, and the row may not exist yet.
    const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
    const existing = leads.find((lead) => lead.week_key === weekKey);

    if (!existing) {
      if (userId) await SheetRepo.insert('week_leads', { week_key: weekKey, user_id: userId }, actor.id);
    } else if (!userId) {
      await SheetRepo.delete('week_leads', existing.id, existing.row_version, actor.id);
    } else if (existing.user_id !== userId) {
      await SheetRepo.update('week_leads', existing.id, { user_id: userId }, existing.row_version, actor.id);
    }

    revalidatePath('/meetings');
    revalidatePath('/dashboard');
  });
}

/**
 * Remove a meeting for good.
 *
 * There was no way to do this at all: deleting the poll a meeting came from
 * left the meeting itself behind, still on the dashboard and still holding the
 * time in everyone's availability, with nothing in the UI able to shift it.
 *
 * Whoever runs the week owns its schedule, so the lead can undo their own
 * booking; admin can always step in. The rows that exist only to describe this
 * meeting go with it, while the things that outlive it -- a topic somebody
 * proposed, a task, the poll that recorded the decision -- are merely detached.
 */
export async function deleteMeeting(meetingId: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const meeting = await SheetRepo.findOne<MeetingRecord>('meetings', meetingId);
    if (!meeting) throw new UserError('error.notFound');

    if (actor.role !== 'admin') {
      const start = labInstant(meeting.start_at);
      const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
      const week = start ? weekKey(start) : '';
      if (!week || !actsAsWeekLead(actor, leads, week)) {
        throw new UserError('avail.leadOnly');
      }
    }

    // Best effort, and deliberately before the row goes: once it is deleted
    // there is nothing left to say which Google event belonged to it. A
    // calendar that refuses must not strand the meeting in the app.
    if (meeting.google_event_id) {
      try {
        await removeMeetingEvent(meeting, actor.id);
      } catch (err) {
        console.error('Could not remove the Google event for this meeting:', err);
      }
    }

    // Only ever true of this meeting, so they have no meaning without it.
    const [attendees, minutes, actionItems] = await Promise.all([
      SheetRepo.find<MeetingAttendeeRecord>('meeting_attendees'),
      SheetRepo.find<MinutesRecord>('minutes'),
      SheetRepo.find<ActionItemRecord>('action_items'),
    ]);

    for (const row of attendees.filter((r) => r.meeting_id === meetingId)) {
      await SheetRepo.delete('meeting_attendees', row.id, row.row_version, actor.id);
    }
    for (const row of minutes.filter((r) => r.meeting_id === meetingId)) {
      await SheetRepo.delete('minutes', row.id, row.row_version, actor.id);
    }
    for (const row of actionItems.filter((r) => r.meeting_id === meetingId)) {
      await SheetRepo.delete('action_items', row.id, row.row_version, actor.id);
    }

    // These stand on their own; they just are not tied to this meeting now.
    const [topics, polls] = await Promise.all([
      SheetRepo.find<TopicRecord>('topics'),
      SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    ]);

    for (const row of topics.filter((r) => r.meeting_id === meetingId)) {
      await SheetRepo.update('topics', row.id, { meeting_id: '' }, row.row_version, actor.id);
    }
    for (const row of polls.filter((r) => r.meeting_id === meetingId)) {
      await SheetRepo.update('availability_polls', row.id, { meeting_id: '' }, row.row_version, actor.id);
    }

    await SheetRepo.delete('meetings', meetingId, rowVersion, actor.id);

    revalidatePath('/meetings');
    revalidatePath('/dashboard');
    revalidatePath('/presentations');
  });
}
