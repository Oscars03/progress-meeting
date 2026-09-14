/**
 * ISO week keys, e.g. 2026-W38.
 *
 * `task_updates.week_key` is one update per task per week, so the key has to be
 * derived the same way everywhere or the same week reads as two. ISO weeks run
 * Monday-Sunday and belong to the year containing their Thursday, which is why
 * this cannot be "week number of the month" arithmetic.
 */

import { labWallClock } from './lab-time';

/**
 * Midnight of the day this instant falls on *in the lab*.
 *
 * Not the server's day: the server runs in UTC, where Monday 07:00 in Bangkok
 * is still Monday 00:00 — but Monday 06:00 in Bangkok is Sunday 23:00, the
 * previous ISO week. Every Monday morning would have been filed under the week
 * before.
 */
function toUtcMidnight(date: Date): Date {
  const lab = labWallClock(date);
  return new Date(Date.UTC(lab.getUTCFullYear(), lab.getUTCMonth(), lab.getUTCDate()));
}

export function weekKey(date: Date = new Date()): string {
  const d = toUtcMidnight(date);
  // Shift to the Thursday of this ISO week; its year is the ISO year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);

  const weeks = Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000)) + 1;
  return `${isoYear}-W${String(weeks).padStart(2, '0')}`;
}

/** The Monday that starts the given ISO week key, as YYYY-MM-DD. */
export function weekStartDate(key: string): string | null {
  const m = key.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const [, year, week] = m;

  const firstThursday = new Date(Date.UTC(Number(year), 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  const isoWeek1Monday = new Date(firstThursday);
  isoWeek1Monday.setUTCDate(firstThursday.getUTCDate() - (firstDay - 1));

  const monday = new Date(isoWeek1Monday);
  monday.setUTCDate(isoWeek1Monday.getUTCDate() + (Number(week) - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** `count` keys ending at the week containing `from`, newest first. */
export function recentWeekKeys(count: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  const cursor = new Date(from);
  for (let i = 0; i < count; i++) {
    keys.push(weekKey(cursor));
    cursor.setDate(cursor.getDate() - 7);
  }
  return keys;
}

/**
 * How many weeks back a key is from the current week. 0 is this week.
 * Returns null for a key this module did not produce.
 */
export function weeksAgo(key: string, from: Date = new Date()): number | null {
  const start = weekStartDate(key);
  if (!start) return null;
  const thisStart = weekStartDate(weekKey(from));
  if (!thisStart) return null;
  const diff = Date.parse(thisStart) - Date.parse(start);
  return Math.round(diff / (7 * 86400000));
}
