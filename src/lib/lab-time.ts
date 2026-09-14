/**
 * The lab's clock.
 *
 * Every time in this app means a time in Thailand, but the server runs in UTC,
 * so anything that leans on the *runtime's* idea of "local" is wrong by seven
 * hours. Two places leaned on it:
 *
 * - A `datetime-local` input hands over "2026-09-25T08:00" with no zone at all.
 *   `new Date()` reads that as the runtime's local time, so 08:00 typed in
 *   Bangkok was stored as 08:00Z -- 15:00 Bangkok. The dashboard then rendered
 *   it server-side (also UTC) and showed "08:00", so it looked right in the one
 *   place it was read back, while the calendar and Google both said 15:00.
 * - An ISO week derived from the server's date puts Monday morning in Bangkok
 *   into the previous week.
 *
 * Thailand keeps no daylight saving, so a fixed offset is exact all year and
 * needs no zone database.
 */

export const LAB_TIME_ZONE = 'Asia/Bangkok';
export const LAB_UTC_OFFSET = '+07:00';

/** Milliseconds the lab's clock runs ahead of UTC. */
const LAB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "2026-09-25T08:00" or "2026-09-25T08:00:00" -- what a datetime-local gives. */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Read a wall-clock string as a time in the lab, not on the server.
 *
 * Returns null for anything that is not a bare wall clock, so a caller can tell
 * "not a time" from "a time". A string that already carries a zone is returned
 * as the instant it names -- the availability grid builds those with the offset
 * attached, and they are already right.
 */
export function labInstant(value: string): Date | null {
  const text = value?.trim();
  if (!text) return null;

  const instant = WALL_CLOCK.test(text)
    ? new Date(`${text.length === 16 ? `${text}:00` : text}${LAB_UTC_OFFSET}`)
    : new Date(text);

  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * The same instant, shifted so its UTC fields read as the lab's wall clock.
 *
 * For date arithmetic only -- the result is a lie about which instant it is,
 * and must never be stored or formatted. Used to ask "which day is it in
 * Thailand" without a zone database.
 */
export function labWallClock(instant: Date = new Date()): Date {
  return new Date(instant.getTime() + LAB_OFFSET_MS);
}

/** A stored instant as the lab reads it, e.g. "พฤ. 25 ก.ย. 08:00". */
export function formatLabTime(iso: string, locale: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';

  return instant.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LAB_TIME_ZONE,
  });
}
