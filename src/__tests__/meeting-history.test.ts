import { describe, it, expect } from 'vitest';
import { isPastWeek, pastWeeks, weekRange } from '../lib/meeting-history';
import type { MeetingRecord, MinutesRecord, TopicRecord, WeekLeadRecord } from '../lib/db/schema';

const base = { created_by: '', updated_at: '', row_version: 1 };

function topic(id: string, week: string, owner: string, extra: Partial<TopicRecord> = {}): TopicRecord {
  return {
    ...base,
    id,
    created_at: `2026-09-01T00:00:0${id.length}Z`,
    title: id,
    details: '',
    owner_id: owner,
    week_key: week,
    meeting_id: '',
    present_order: '',
    status: 'planned',
    ...extra,
  } as TopicRecord;
}

function meeting(id: string, start: string, extra: Partial<MeetingRecord> = {}): MeetingRecord {
  return { ...base, id, created_at: '', title: id, start_at: start, end_at: start, status: 'scheduled', ...extra } as MeetingRecord;
}

const lead = (week: string, user: string) =>
  ({ ...base, id: `l-${week}`, created_at: '', week_key: week, user_id: user }) as WeekLeadRecord;

describe('pastWeeks', () => {
  it('lists only weeks before the active one, newest first', () => {
    const weeks = pastWeeks(
      {
        meetings: [],
        minutes: [],
        topics: [topic('a', '2026-W38', 'u1'), topic('b', '2026-W39', 'u1'), topic('c', '2026-W40', 'u1')],
        leads: [lead('2026-W40', 'u2')],
      },
      '2026-W40',
    );

    expect(weeks.map((w) => w.weekKey)).toEqual(['2026-W39', '2026-W38']);
  });

  it('puts the meeting in the week it was held, in the lab zone, with its minutes', () => {
    // 23:30 UTC Sunday is 06:30 Monday in Bangkok -- the next ISO week.
    const m = meeting('m1', '2026-09-20T23:30:00.000Z');
    const minutes = { ...base, id: 'mn', created_at: '', meeting_id: 'm1', content: 'decided', recorded_by: '' } as MinutesRecord;

    const [week] = pastWeeks({ meetings: [m], minutes: [minutes], topics: [], leads: [] }, '2026-W40');

    expect(week.weekKey).toBe('2026-W39');
    expect(week.meetings).toEqual([{ meeting: m, minutes }]);
  });

  it('keeps a week that met without a booking, and names its lead', () => {
    const [week] = pastWeeks(
      { meetings: [], minutes: [], topics: [topic('a', '2026-W39', 'u1')], leads: [lead('2026-W39', 'u2')] },
      '2026-W40',
    );

    expect(week).toMatchObject({ weekKey: '2026-W39', leadId: 'u2', meetings: [] });
    expect(week.topics.map((t) => t.id)).toEqual(['a']);
  });

  it('shows topics in the arranged order when one was saved', () => {
    const [week] = pastWeeks(
      {
        meetings: [],
        minutes: [],
        topics: [
          topic('a', '2026-W39', 'u1', { present_order: 2 }),
          topic('b', '2026-W39', 'u2', { present_order: 1 }),
        ],
        leads: [],
      },
      '2026-W40',
    );

    expect(week.topics.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('leaves out cancelled meetings, dropped topics, and weeks with nothing else', () => {
    const weeks = pastWeeks(
      {
        meetings: [meeting('gone', '2026-09-16T03:00:00.000Z', { status: 'cancelled' })],
        minutes: [],
        topics: [topic('x', '2026-W38', 'u1', { status: 'dropped' })],
        leads: [],
      },
      '2026-W40',
    );

    expect(weeks).toEqual([]);
  });
});

describe('isPastWeek', () => {
  it('compares across a year boundary', () => {
    expect(isPastWeek('2026-W52', '2027-W01')).toBe(true);
    expect(isPastWeek('2027-W01', '2027-W01')).toBe(false);
  });
});

describe('weekRange', () => {
  it('spans Monday to Sunday', () => {
    expect(weekRange('2026-W38', 'en')).toBe('14 Sept – 20 Sept');
  });
});
