/**
 * Whether to ask somebody to mark the hours they cannot make.
 *
 * The lead finds a meeting time on the availability grid, which counts an
 * hour as free unless something claims it: a Google calendar the app can
 * read, or hours a member blocked out by hand. Somebody with neither looks
 * free all week, and the lead books over their lecture -- so the dashboard
 * asks, while there is still a meeting to find.
 *
 * Not asked once the week has a meeting, or a poll (the hours have been
 * picked by then), or during a break.
 *
 * A connected Google calendar answers only if it has something in the week.
 * It used to count as an answer by being connected at all, so somebody whose
 * calendar sat empty all term -- connected once, never kept -- was never
 * asked, and looked free on every grid. The shared week's picture names
 * students with nothing in the week from either source, and this asks the
 * same people, by the same test.
 */

import type { MeetingRecord, PersonalEventRecord } from './db/schema';
import { labInstant } from './lab-time';
import { weekKey, weekStartDate } from './week';

export type BusyNudgeInput = {
  userId: string;
  /** The week the lab is arranging -- the dashboard's `activeWeekKey`. */
  week: string;
  isBreak: boolean;
  meetings: MeetingRecord[];
  personalEvents: PersonalEventRecord[];
  /** Users whose Google calendar the grid can read. */
  connected: Set<string>;
  /**
   * This user's Google busy hours over the week, or null when they could not
   * be read -- which is not asked about: a failing calendar is not the
   * person's to fix by marking hours.
   */
  googleBusy: { start: string; end: string }[] | null;
  /** Polls still open for this user's lab. */
  openPollCount: number;
};

export function needsBusyTimes(input: BusyNudgeInput): boolean {
  const { userId, week, meetings, personalEvents, connected } = input;
  if (!userId || input.isBreak || input.openPollCount > 0) return false;
  if (connected.has(userId) && input.googleBusy === null) return false;

  const monday = weekStartDate(week);
  if (!monday) return false;
  const from = labInstant(`${monday}T00:00`)!.getTime();
  const to = from + 7 * 86400000;

  const booked = meetings.some((meeting) => {
    if (meeting.status === 'cancelled' || !meeting.start_at) return false;
    const start = labInstant(meeting.start_at);
    return start !== null && weekKey(start) === week;
  });
  if (booked) return false;

  // Any hour of theirs that touches the week counts: a blocked-out Sunday is
  // still an answer, and asking again after it would read as not having seen it.
  const touches = (startAt: string, endAt: string) => {
    const start = labInstant(startAt);
    const end = labInstant(endAt) ?? start;
    return start !== null && end !== null && start.getTime() < to && end.getTime() > from;
  };
  const marked = personalEvents.some((event) => event.user_id === userId && touches(event.start_at, event.end_at));
  const fromGoogle = connected.has(userId) && (input.googleBusy ?? []).some((b) => touches(b.start, b.end));

  return !marked && !fromGoogle;
}
