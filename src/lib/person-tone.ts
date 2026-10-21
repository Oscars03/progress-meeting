import type { UserRecord } from './db/schema';

/**
 * Which avatar colour a person is drawn in: 0 for an advisor, 1-5 for everyone
 * else, from their id so it never changes with their name. The same person is
 * the same colour on Tasks and on the meeting planner.
 */
export function toneOf(user: Pick<UserRecord, 'id' | 'role'>): number {
  if (user.role === 'professor') return 0;
  let h = 0;
  for (const ch of user.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 5) + 1;
}
