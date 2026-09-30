import type { MeetingRecord, MinutesRecord, TopicRecord, WeekLeadRecord } from './db/schema';
import { effectiveTopicOrder, topicsForWeek } from './presentation-order';
import { labInstant } from './lab-time';
import { weekKey, weekStartDate } from './week';

/**
 * Past weeks, as a record anybody may read.
 *
 * The weekly meeting is spread over four tabs -- who led the week, the topics
 * brought to it, the meeting that was booked, and the minutes written after --
 * and until this existed only the current week had a screen. Last week's topics
 * could not be seen at all, and a meeting's minutes only by paging the calendar
 * back to the right day.
 */

export type PastMeeting = {
  meeting: MeetingRecord;
  minutes: MinutesRecord | null;
};

export type PastWeek = {
  weekKey: string;
  /** Who ran the week; '' when nobody was recorded for it. */
  leadId: string;
  /** In the order they were presented, as the running order showed it. */
  topics: TopicRecord[];
  /** Earliest first. Usually one; none when the week met without a booking. */
  meetings: PastMeeting[];
};

/**
 * Whether a week is over for editing: it comes before the week the running
 * order is on now. See `activeWeekKey` for when that rolls over.
 *
 * ISO week keys are zero-padded, so they compare correctly as strings.
 */
export function isPastWeek(key: string, activeWeek: string): boolean {
  return key < activeWeek;
}

/**
 * Every week before `activeWeek` that left something behind, newest first.
 *
 * A week with nothing in it -- a term break, or a week before the app was in
 * use -- is left out rather than shown as an empty card. A week that met
 * without anybody booking the meeting in the app still counts: its topics are
 * the record.
 */
export function pastWeeks(
  data: {
    meetings: MeetingRecord[];
    minutes: MinutesRecord[];
    topics: TopicRecord[];
    leads: WeekLeadRecord[];
  },
  activeWeek: string,
): PastWeek[] {
  const meetingsByWeek = new Map<string, MeetingRecord[]>();
  for (const meeting of data.meetings) {
    if (meeting.status === 'cancelled') continue;
    const start = labInstant(meeting.start_at);
    if (!start) continue;
    const key = weekKey(start);
    const list = meetingsByWeek.get(key);
    if (list) list.push(meeting);
    else meetingsByWeek.set(key, [meeting]);
  }

  const keys = new Set<string>([
    ...meetingsByWeek.keys(),
    ...data.topics.filter((topic) => topic.status !== 'dropped').map((topic) => topic.week_key),
    ...data.leads.map((lead) => lead.week_key),
  ]);

  return [...keys]
    .filter((key) => /^\d{4}-W\d{2}$/.test(key) && isPastWeek(key, activeWeek))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({
      weekKey: key,
      leadId: data.leads.find((lead) => lead.week_key === key)?.user_id ?? '',
      topics: effectiveTopicOrder(topicsForWeek(data.topics, key)).ordered,
      meetings: (meetingsByWeek.get(key) ?? [])
        .sort((a, b) => (a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0))
        .map((meeting) => ({
          meeting,
          minutes: data.minutes.find((m) => m.meeting_id === meeting.id) ?? null,
        })),
    }));
}

/**
 * Monday to Sunday of a week, as the lab reads a calendar -- "15 ก.ย. – 21 ก.ย.".
 *
 * "2026-W38" alone means nothing to most people. The dates are formatted in
 * UTC because `weekStartDate` returns a calendar day, not an instant.
 */
export function weekRange(key: string, locale: string): string {
  const monday = weekStartDate(key);
  if (!monday) return '';

  const start = new Date(`${monday}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const format = (d: Date) =>
    d.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  return `${format(start)} – ${format(end)}`;
}
