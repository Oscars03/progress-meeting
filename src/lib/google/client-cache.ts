import type { calendar_v3 } from 'googleapis';

/**
 * Calendar clients already built for a person, kept so a run of calls does not
 * pay for a token exchange each time (+200-500ms).
 *
 * This lives apart from calendar.ts because the token store has to be able to
 * drop an entry -- a connection that has just been removed or replaced must not
 * keep working -- and calendar.ts already imports the token store. Holding the
 * map in either file would make the two import each other.
 *
 * Per-process only. On a multi-instance deploy each instance caches its own
 * clients and forgets its own, so an entry dropped here is dropped on this
 * instance alone; the others expire on the TTL below.
 */

/**
 * Under Google's 60-minute access token lifetime, so a client handed back from
 * the cache still holds a token it can use.
 */
const CLIENT_TTL = 50 * 60 * 1000;

const clients = new Map<string, { calendar: calendar_v3.Calendar; ts: number }>();

/** A client still inside its TTL, or null when one has to be built. */
export function cachedClient(userId: string): calendar_v3.Calendar | null {
  const hit = clients.get(userId);
  if (!hit) return null;

  if (Date.now() - hit.ts >= CLIENT_TTL) {
    clients.delete(userId);
    return null;
  }
  return hit.calendar;
}

export function cacheClient(userId: string, calendar: calendar_v3.Calendar): void {
  clients.set(userId, { calendar, ts: Date.now() });
}

/**
 * Forget one person's client, so the next call builds a fresh one.
 *
 * Called whenever the stored token stops being the one the cached client holds:
 * a disconnect, a reconnect that writes a new refresh token -- which may belong
 * to an entirely different Google account -- or a grant Google has rejected.
 */
export function forgetClient(userId: string): void {
  clients.delete(userId);
}
