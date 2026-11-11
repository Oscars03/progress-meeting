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

/** The ISO week key immediately after the given one. */
export function nextWeekKey(key: string): string {
  const monday = weekStartDate(key);
  if (!monday) return key;

  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return weekKey(d);
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

/** The ISO week key immediately before the given one. */
export function previousWeekKey(key: string): string {
  const monday = weekStartDate(key);
  if (!monday) return key;

  const d = new Date(`${monday}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return weekKey(d);
}

/**
 * Whether `key` names a week that exists: the right shape, and the same key
 * comes back from its own Monday. `2026-W60` has the shape and no such week;
 * `2026-W53` exists, `2025-W53` does not.
 */
export function isRealWeekKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-W\d{2}$/.test(key)) return false;
  const monday = weekStartDate(key);
  if (!monday) return false;
  return weekKey(new Date(`${monday}T12:00:00Z`)) === key;
}

/** YYYY-MM of a week's Thursday -- the month a list puts a spanning week in. */
export function monthOfWeek(key: string): string | null {
  const monday = weekStartDate(key);
  if (!monday) return null;
  const thursday = new Date(`${monday}T12:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  return thursday.toISOString().slice(0, 7);
}

/** Whether `month` is a real YYYY-MM. */
export function isMonthKey(month: unknown): month is string {
  return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/** The month after (or with `step` -1, before) a YYYY-MM. */
export function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Every week whose Thursday falls in `month`, in order -- so each week is in
 * exactly one month, and a list of months never shows a week twice.
 */
export function weeksOfMonth(month: string): string[] {
  if (!isMonthKey(month)) return [];
  return weeksTouchingMonth(month).filter((key) => monthOfWeek(key) === month);
}

/**
 * Every week with at least one day in `month`, in order -- what a month grid
 * draws, where the week either side of a month boundary shows in both.
 */
export function weeksTouchingMonth(month: string): string[] {
  if (!isMonthKey(month)) return [];
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const out: string[] = [];
  let key = weekKey(new Date(`${first}T12:00:00Z`));
  for (let i = 0; i < 7; i++) {
    const monday = weekStartDate(key);
    if (!monday || monday >= next) break;
    out.push(key);
    key = nextWeekKey(key);
  }
  return out;
}
