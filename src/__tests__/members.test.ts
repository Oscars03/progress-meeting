/**
 * Who counts as a member of the lab.
 *
 * `admin` was filtered out of the rotation and nowhere else, so every other
 * part of the app still treated it as one of the group: it appeared in
 * "3 of 7 connected", its free time was weighed when finding a slot everyone
 * could make, and its name showed on the shared calendar.
 */

import { describe, it, expect } from 'vitest';
import { isMember, labMembers } from '../lib/members';
import type { UserRecord } from '../lib/db/schema';

function user(over: Partial<UserRecord>): UserRecord {
  return {
    id: 'u1',
    name: 'Somebody',
    email: 'x@test.com',
    role: 'student',
    active: true,
    ...over,
  } as UserRecord;
}

describe('isMember', () => {
  it('counts a student', () => {
    expect(isMember(user({ role: 'student' }))).toBe(true);
  });

  // Professors take no turn in the rotation, which is a different question
  // from whether a meeting has to suit them. It does.
  it('counts a professor, who attends even though they never lead', () => {
    expect(isMember(user({ role: 'professor' }))).toBe(true);
  });

  it('does not count an admin, which is the account that runs the app', () => {
    expect(isMember(user({ role: 'admin' }))).toBe(false);
  });

  it('does not count a deactivated account, whose availability can never arrive', () => {
    expect(isMember(user({ role: 'student', active: false }))).toBe(false);
    expect(isMember(user({ role: 'professor', active: false }))).toBe(false);
  });
});

describe('labMembers', () => {
  it('keeps the order it was given, so a caller can sort as it likes', () => {
    const users = [
      user({ id: 'b', role: 'professor' }),
      user({ id: 'a', role: 'student' }),
      user({ id: 'c', role: 'student' }),
    ];
    expect(labMembers(users).map((u) => u.id)).toEqual(['b', 'a', 'c']);
  });

  it('drops admins and deactivated accounts together', () => {
    const users = [
      user({ id: 'student', role: 'student' }),
      user({ id: 'boss', role: 'admin' }),
      user({ id: 'prof', role: 'professor' }),
      user({ id: 'gone', role: 'student', active: false }),
    ];
    expect(labMembers(users).map((u) => u.id)).toEqual(['student', 'prof']);
  });

  it('returns nothing when the lab is only admins', () => {
    expect(labMembers([user({ role: 'admin' }), user({ id: 'u2', role: 'admin' })])).toEqual([]);
  });
});
