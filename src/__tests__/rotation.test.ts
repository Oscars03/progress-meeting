import { describe, it, expect } from 'vitest';
import {
  actsAsWeekLead,
  rotationMembers,
  suggestNextHost,
  leadForWeek,
  meetingsInWeek,
  nextMeeting,
  weeksRunBy,
} from '../lib/rotation';
import { weekKey } from '../lib/week';
import type { MeetingRecord, UserRecord, WeekLeadRecord } from '../lib/db/schema';

function user(
  id: string,
  role: string,
  joined: string,
  active = true,
  rotationOrder: number | string = '',
): UserRecord {
  return {
    id,
    created_at: joined,
    updated_at: joined,
    row_version: 1,
    created_by: 'seed',
    name: id,
    email: `${id}@test.com`,
    password_hash: '',
    role,
    team_id: '',
    line_id: '',
    active,
    rotation_order: rotationOrder,
  };
}

function meeting(id: string, start: string, host = '', status = 'scheduled'): MeetingRecord {
  return {
    id,
    created_at: start,
    updated_at: start,
    row_version: 1,
    created_by: 'seed',
    title: id,
    start_at: start,
    end_at: start,
    location: '',
    meet_link: '',
    status,
    recurrence_rule: '',
    owner_id: '',
    notes: '',
    google_event_id: '',
    google_calendar_owner_id: '',
    google_synced_at: '',
    host_id: host,
  };
}

function lead(week: string, userId: string): WeekLeadRecord {
  return {
    id: `${week}-${userId}`,
    created_at: week,
    updated_at: week,
    row_version: 1,
    created_by: 'seed',
    week_key: week,
    user_id: userId,
  };
}

const students = [
  user('stu1', 'member', '2026-01-01'),
  user('stu2', 'member', '2026-01-02'),
  user('stu3', 'member', '2026-01-03'),
];

describe('rotationMembers', () => {
  it('excludes professors, admins and viewers', () => {
    const users = [
      ...students,
      user('prof', 'professor', '2026-01-01'),
      user('root', 'admin', '2026-01-01'),
      user('guest', 'viewer', '2026-01-01'),
    ];

    expect(rotationMembers(users).map((u) => u.id)).toEqual(['stu1', 'stu2', 'stu3']);
  });

  it('excludes deactivated students', () => {
    const users = [...students, user('gone', 'member', '2026-01-04', false)];
    expect(rotationMembers(users).map((u) => u.id)).not.toContain('gone');
  });

  it('keeps a student lead who holds manager rank', () => {
    const users = [...students, user('lead', 'manager', '2026-01-04')];
    expect(rotationMembers(users).map((u) => u.id)).toContain('lead');
  });
});

describe('suggestNextHost', () => {
  it('starts at the top of the list when nobody has held a week', () => {
    expect(suggestNextHost(students, [])?.id).toBe('stu1');
  });

  it('steps to the student after whoever held the most recent week', () => {
    expect(suggestNextHost(students, [lead('2026-W10', 'stu1')])?.id).toBe('stu2');
  });

  it('wraps around at the end of the list', () => {
    expect(suggestNextHost(students, [lead('2026-W10', 'stu3')])?.id).toBe('stu1');
  });

  it('reads "most recent" by week key, not by row order', () => {
    const leads = [lead('2026-W07', 'stu3'), lead('2026-W38', 'stu1'), lead('2026-W10', 'stu2')];
    expect(suggestNextHost(students, leads)?.id).toBe('stu2');
  });

  it('follows the order an admin arranged, not the order people joined', () => {
    // Joined stu1, stu2, stu3 -- arranged stu3, stu2, stu1.
    const arranged = [
      user('stu1', 'member', '2026-01-01', true, 3),
      user('stu2', 'member', '2026-01-02', true, 2),
      user('stu3', 'member', '2026-01-03', true, 1),
    ];

    expect(rotationMembers(arranged).map((u) => u.id)).toEqual(['stu3', 'stu2', 'stu1']);
    expect(suggestNextHost(arranged, [lead('2026-W10', 'stu3')])?.id).toBe('stu2');
  });

  it('queues a student nobody placed after the ones who were', () => {
    const mixed = [
      user('placed', 'member', '2026-01-09', true, 1),
      user('newcomer', 'member', '2026-01-01'),
    ];

    expect(rotationMembers(mixed).map((u) => u.id)).toEqual(['placed', 'newcomer']);
  });

  it('starts over when the last lead has left the rotation', () => {
    expect(suggestNextHost(students, [lead('2026-W10', 'graduated')])?.id).toBe('stu1');
  });

  it('needs no meeting for a week to count as taken', () => {
    // The whole point of storing the duty on the week: no meetings exist here.
    expect(suggestNextHost(students, [lead('2026-W38', 'stu1')])?.id).toBe('stu2');
  });

  it('returns null when there are no students', () => {
    expect(suggestNextHost([user('prof', 'professor', '2026-01-01')], [])).toBeNull();
  });
});

describe('leadForWeek', () => {
  it('finds the lead for the asked-for week only', () => {
    const leads = [lead('2026-W37', 'stu1'), lead('2026-W38', 'stu2')];
    expect(leadForWeek(leads, '2026-W38')?.user_id).toBe('stu2');
    expect(leadForWeek(leads, '2026-W39')).toBeNull();
  });
});

/**
 * Who runs a week, including an admin looking through the lead's eyes.
 *
 * Every page and every action asks this rather than isWeekLead, so that the
 * preview is coherent: showing the lead's buttons and then refusing behind
 * them would be worse than not offering them.
 */
describe('actsAsWeekLead', () => {
  const thisWeek = weekKey();
  const nextWeek = '2099-W01';

  it('is true for whoever actually holds the week', () => {
    const leads = [lead(nextWeek, 'stu1')];
    expect(actsAsWeekLead({ id: 'stu1' }, leads, nextWeek)).toBe(true);
    expect(actsAsWeekLead({ id: 'stu2' }, leads, nextWeek)).toBe(false);
  });

  it('is true for somebody previewing the lead view, for this week', () => {
    expect(actsAsWeekLead({ id: 'boss', previewingLead: true }, [], thisWeek)).toBe(true);
  });

  // The preview answers "what does this week's lead see". It is not a way to
  // take over a week somebody else holds.
  it('does not reach any other week', () => {
    const leads = [lead(nextWeek, 'stu1')];
    expect(actsAsWeekLead({ id: 'boss', previewingLead: true }, leads, nextWeek)).toBe(false);
  });

  it('is false for anybody not previewing, with no week of their own', () => {
    expect(actsAsWeekLead({ id: 'boss' }, [], thisWeek)).toBe(false);
    expect(actsAsWeekLead({ id: 'boss', previewingLead: false }, [], thisWeek)).toBe(false);
  });
});

describe('weeksRunBy', () => {
  it('is the weeks they hold when not previewing', () => {
    const leads = [lead('2026-W37', 'stu1'), lead('2026-W38', 'stu2')];
    expect(weeksRunBy({ id: 'stu1' }, leads)).toEqual(['2026-W37']);
  });

  it('folds the current week in while previewing the lead view', () => {
    expect(weeksRunBy({ id: 'boss', previewingLead: true }, [])).toEqual([weekKey()]);
  });

  it('does not list the current week twice for a lead previewing their own week', () => {
    const leads = [lead(weekKey(), 'stu1')];
    expect(weeksRunBy({ id: 'stu1', previewingLead: true }, leads)).toEqual([weekKey()]);
  });
});

describe('meetingsInWeek', () => {
  it('keeps only meetings inside the ISO week, earliest first', () => {
    const meetings = [
      meeting('wed', '2026-09-16T09:00:00.000Z'),
      meeting('mon', '2026-09-14T09:00:00.000Z'),
      meeting('nextWeek', '2026-09-22T09:00:00.000Z'),
      meeting('lastWeek', '2026-09-08T09:00:00.000Z'),
    ];

    const inWeek = meetingsInWeek(meetings, new Date('2026-09-15T00:00:00.000Z'));
    expect(inWeek.map((m) => m.id)).toEqual(['mon', 'wed']);
  });

  it('drops cancelled meetings', () => {
    const meetings = [meeting('off', '2026-09-16T09:00:00.000Z', '', 'cancelled')];
    expect(meetingsInWeek(meetings, new Date('2026-09-15T00:00:00.000Z'))).toEqual([]);
  });
});

describe('nextMeeting', () => {
  it('returns the soonest meeting that has not started', () => {
    const meetings = [
      meeting('later', '2026-09-20T09:00:00.000Z'),
      meeting('past', '2026-09-01T09:00:00.000Z'),
      meeting('soon', '2026-09-15T09:00:00.000Z'),
    ];

    expect(nextMeeting(meetings, new Date('2026-09-14T00:00:00.000Z'))?.id).toBe('soon');
  });

  it('returns null when everything is in the past', () => {
    const meetings = [meeting('past', '2026-09-01T09:00:00.000Z')];
    expect(nextMeeting(meetings, new Date('2026-09-14T00:00:00.000Z'))).toBeNull();
  });
});
