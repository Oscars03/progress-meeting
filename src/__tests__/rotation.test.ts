import { describe, it, expect } from 'vitest';
import {
  rotationMembers,
  suggestNextHost,
  meetingsInWeek,
  nextMeeting,
} from '../lib/rotation';
import type { MeetingRecord, UserRecord } from '../lib/db/schema';

function user(id: string, role: string, joined: string, active = true): UserRecord {
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
  it('suggests the first student when nobody has hosted', () => {
    expect(suggestNextHost(students, [])?.id).toBe('stu1');
  });

  it('prefers someone who has never hosted over the longest-ago host', () => {
    const meetings = [meeting('m1', '2020-01-01T09:00:00.000Z', 'stu2')];
    expect(suggestNextHost(students, meetings)?.id).toBe('stu1');
  });

  it('picks the student who hosted longest ago once everyone has had a turn', () => {
    const meetings = [
      meeting('m1', '2026-03-01T09:00:00.000Z', 'stu1'),
      meeting('m2', '2026-02-01T09:00:00.000Z', 'stu2'),
      meeting('m3', '2026-04-01T09:00:00.000Z', 'stu3'),
    ];

    expect(suggestNextHost(students, meetings)?.id).toBe('stu2');
  });

  it('does not suggest someone already booked for a future meeting', () => {
    const meetings = [
      meeting('past', '2026-01-05T09:00:00.000Z', 'stu1'),
      meeting('soon', '2099-01-01T09:00:00.000Z', 'stu2'),
      meeting('old', '2026-01-04T09:00:00.000Z', 'stu3'),
    ];

    expect(suggestNextHost(students, meetings)?.id).toBe('stu3');
  });

  it('ignores a cancelled meeting, so that turn still counts as untaken', () => {
    const meetings = [meeting('m1', '2026-03-01T09:00:00.000Z', 'stu1', 'cancelled')];
    expect(suggestNextHost(students, meetings)?.id).toBe('stu1');
  });

  it('returns null when there are no students', () => {
    expect(suggestNextHost([user('prof', 'professor', '2026-01-01')], [])).toBeNull();
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
