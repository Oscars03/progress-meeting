/**
 * The project tracker's rules: how a piece of work is judged against the time
 * it has had, and where it sits on the timeline.
 *
 * A plain module, not an actions file, so the page, the client components and
 * the server actions can all import the same constants (see CLAUDE.md on
 * 'use server' exports). Every date here is a lab day, YYYY-MM-DD, compared
 * as a calendar date -- never an instant, so nothing shifts by a timezone.
 */

/** Labels a professor can put on a project. '' is none. */
export const TASK_TAGS = ['Journal', 'Conference', 'Thesis'] as const;
export type TaskTag = (typeof TASK_TAGS)[number];

export function isTaskTag(value: string): value is TaskTag {
  return (TASK_TAGS as readonly string[]).includes(value);
}

/** One line of a project's checklist. */
export type Subtask = { id: string; title: string; done: boolean };

export const MAX_SUBTASKS = 50;
export const MAX_SUBTASK_TITLE = 200;
export const MAX_ROUND_NAME = 60;

/** One round as the rounds dialog sends it back. */
export type RoundInput = {
  /** Absent for a round being added. */
  id?: string;
  name: string;
  due_date: string;
  /** The version read with an existing round. */
  rowVersion?: number;
};

/**
 * The stored checklist, whatever shape the cell came back in.
 *
 * The repository decodes a cell starting with `[` as JSON, so this is usually
 * an array already; a hand-edited cell may still be a string. Anything that
 * does not read as a checklist is an empty one rather than an error -- a
 * mangled cell must not take the whole board down with it.
 */
export function readSubtasks(stored: unknown): Subtask[] {
  let raw: unknown = stored;
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const out: Subtask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, title, done } = item as Record<string, unknown>;
    if (typeof title !== 'string' || !title.trim()) continue;
    out.push({
      id: typeof id === 'string' && id ? id : `s${out.length + 1}`,
      title: title.trim().slice(0, MAX_SUBTASK_TITLE),
      done: done === true,
    });
  }
  return out.slice(0, MAX_SUBTASKS);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD, and nothing else. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/**
 * How much of the work's time has gone, 0-100, counting both end days.
 *
 * null when there is no due date to measure against -- such work can still be
 * reported on, but it cannot be behind a schedule it does not have.
 */
export function elapsedPct(start: string, due: string, today: string): number | null {
  if (!isDay(start) || !isDay(due)) return null;
  const span = Math.max(1, daysBetween(start, due) + 1);
  const gone = daysBetween(start, today) + 1;
  return Math.min(100, Math.max(0, Math.round((gone / span) * 100)));
}

export const HEALTHS = ['ok', 'warn', 'bad', 'done', 'stale'] as const;
export type Health = (typeof HEALTHS)[number];

/** A week and a day: long enough to cover a weekly meeting that slipped by a day. */
export const STALE_AFTER_DAYS = 8;

/** Behind by more than this many points of elapsed time is "behind plan". */
export const BEHIND_BY = 15;
/** Behind by more than this, and no more than BEHIND_BY, is worth watching. */
export const WATCH_BY = 5;

export type HealthInput = {
  status: string;
  start: string;
  due: string;
  progress: number;
  /** Lab day progress was last reported, or null if it never was. */
  lastUpdate: string | null;
};

/**
 * Where a piece of work stands: on plan, worth watching, behind, delivered,
 * or not heard from.
 *
 * Work that has not started yet is on plan -- nothing was due from it. Silence
 * is reported before lateness, because a figure nobody has touched in over a
 * week is not evidence of anything, least of all of being on track.
 */
export function projectHealth(input: HealthInput, today: string): Health {
  if (input.status === 'done') return 'done';
  if (isDay(input.start) && daysBetween(today, input.start) > 0) return 'ok';
  if (!input.lastUpdate || daysBetween(input.lastUpdate, today) > STALE_AFTER_DAYS) return 'stale';
  const elapsed = elapsedPct(input.start, input.due, today);
  if (elapsed === null) return 'ok';
  const gap = elapsed - input.progress;
  if (gap > BEHIND_BY) return 'bad';
  if (gap > WATCH_BY) return 'warn';
  return 'ok';
}

/** The later of two optional lab days. */
export function laterDay(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** First day of the month `offset` months from the one `day` falls in. */
export function monthStart(day: string, offset = 0): string {
  const [y, m] = day.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

/** Months from the month of `from` to the month of `to`, whole. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export const MIN_MONTHS = 6;
export const MAX_MONTHS = 30;

/**
 * The months the timeline shows: from the month before today, to the month
 * of the latest date anything is due -- at least MIN_MONTHS so a quiet board
 * still reads as a calendar, at most MAX_MONTHS so one far-off date does not
 * squeeze everything else into slivers.
 */
export function timelineWindow(today: string, dates: string[]): { start: string; months: number } {
  const start = monthStart(today, -1);
  const latest = dates.filter(isDay).reduce((max, d) => (d > max ? d : max), today);
  const months = monthsBetween(start, latest) + 1;
  return { start, months: Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, months)) };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * How far into the window a day falls, in months, fractional. The start of
 * the day; add `endOfDay` to reach its close, which is where a deadline sits.
 */
export function monthOffset(windowStart: string, day: string, endOfDay = false): number {
  const [y, m, d] = day.split('-').map(Number);
  const whole = monthsBetween(windowStart, day);
  return whole + (d - 1 + (endOfDay ? 1 : 0)) / daysInMonth(y, m);
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Month names and years by hand rather than Intl: the tracker renders on the
 * server and again in the browser, and two ICU builds disagreeing about "ต.ค."
 * would be a hydration mismatch. Thai years are Buddhist Era.
 */
export function monthName(month: number, locale: 'th' | 'en'): string {
  return (locale === 'th' ? TH_MONTHS : EN_MONTHS)[month];
}

export function yearLabel(year: number, locale: 'th' | 'en'): number {
  return locale === 'th' ? year + 543 : year;
}

/** "31 ต.ค. 69" or, with `long`, "31 ต.ค. 2569". */
export function formatDay(day: string, locale: 'th' | 'en', long = false): string {
  if (!isDay(day)) return '';
  const [y, m, d] = day.split('-').map(Number);
  const year = yearLabel(y, locale);
  return `${d} ${monthName(m - 1, locale)} ${long ? year : String(year % 100).padStart(2, '0')}`;
}
