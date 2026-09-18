/**
 * Who counts as a member of the lab.
 *
 * `admin` is a system account, not a person who attends. It was being filtered
 * only out of the *rotation*, so everywhere else still treated it as one of the
 * group: it appeared in "3 of 7 connected", its free time was weighed when
 * finding a slot everyone could make, its name showed on the calendar, and it
 * turned up in every people picker. A meeting does not have to suit the
 * account that administers the app.
 *
 * Professors stay. They advise rather than report -- which is why they take no
 * turn in the rotation -- but they attend, so a time has to suit them.
 *
 * Deactivated accounts are not members either: they cannot sign in, so counting
 * them would mean waiting on availability that can never arrive.
 */

import type { UserRecord } from './db/schema';

/** Roles that are not people in the lab. */
const NOT_A_MEMBER = new Set(['admin']);

export function isMember(user: Pick<UserRecord, 'active' | 'role'>): boolean {
  return user.active === true && !NOT_A_MEMBER.has(user.role);
}

/** Everyone a meeting has to work around. */
export function labMembers<T extends Pick<UserRecord, 'active' | 'role'>>(users: T[]): T[] {
  return users.filter(isMember);
}

/**
 * The same set, as ids, for filtering rows that only carry a user id.
 *
 * A poll is asked of members and counted over members, so a vote from anybody
 * else has to be dropped rather than merely uncounted -- an admin's yes was
 * being added to the tally while admin was left out of the denominator, which
 * could read as "everyone can make it" while a real member had not answered.
 */
export function memberIds<T extends Pick<UserRecord, 'id' | 'active' | 'role'>>(
  users: T[]
): Set<string> {
  return new Set(labMembers(users).map((u) => u.id));
}
