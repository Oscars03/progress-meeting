import type { AppLogRecord } from './db/schema';

/**
 * Reading the app log back, for Settings → Logs. Kept apart from the page so
 * the counting and filtering can be tested without rendering it.
 */

export const LOG_LEVELS = ['error', 'warn', 'info'] as const;
export type LogLevelFilter = (typeof LOG_LEVELS)[number] | 'all';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isLevelFilter(value: unknown): value is LogLevelFilter {
  return value === 'all' || (LOG_LEVELS as readonly unknown[]).includes(value);
}

/**
 * A cell back as the text it was written as.
 *
 * SheetRepo turns a cell that starts with `{` or `[` into JSON, and "TRUE" into
 * a boolean. A log message is whatever was thrown -- a browser that rejects a
 * promise with `{status: 500}` sends exactly that, and so can anybody posting
 * to /api/log -- and an object rendered as text takes the whole page down. The
 * row that does it is kept for 180 days.
 */
export function logText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Every text column of every row as text. Run over the rows before anything else reads them. */
export function readableLogRows(rows: AppLogRecord[]): AppLogRecord[] {
  return rows.map((row) => ({
    ...row,
    created_at: logText(row.created_at),
    level: logText(row.level),
    event: logText(row.event),
    user_id: logText(row.user_id),
    path: logText(row.path),
    message: logText(row.message),
  }));
}

/** What the last seven days came to: the four numbers at the top of the page. */
export function summarizeLog(rows: AppLogRecord[], now: number) {
  let errors = 0;
  let warnings = 0;
  let views = 0;
  const people = new Set<string>();

  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (Number.isNaN(at) || now - at > WEEK_MS) continue;
    if (row.level === 'error') errors++;
    else if (row.level === 'warn') warnings++;
    if (row.event === 'view') views++;
    // Somebody who only ever failed to sign in did not use the app.
    if (row.user_id && row.event !== 'sign_in_failed') people.add(row.user_id);
  }
  return { errors, warnings, views, people: people.size };
}

/** Newest first, narrowed to one level and one person when asked. */
export function filterLog(
  rows: AppLogRecord[],
  filter: { level: LogLevelFilter; userId: string }
): AppLogRecord[] {
  return rows
    .filter((row) => filter.level === 'all' || row.level === filter.level)
    .filter((row) => !filter.userId || row.user_id === filter.userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * The detail cell as something a person can read.
 *
 * The repository hands a JSON cell back already parsed, so it may arrive as an
 * object or as the string it was stored as. Stack traces are stored with
 * escaped line breaks; they are put back, so a stack reads as a stack.
 */
export function formatLogDetail(detail: unknown): string {
  if (detail === '' || detail === null || detail === undefined) return '';
  let value = detail;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return value as string;
    }
  }
  return JSON.stringify(value, null, 2).replace(/\\n/g, '\n');
}
