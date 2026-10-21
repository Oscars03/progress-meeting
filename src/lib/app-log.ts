import { after } from 'next/server';
import { getSheetsApi, getSpreadsheetId } from './db/sheet-client';
import { SCHEMAS } from './db/schema';

/**
 * What went wrong, and what people were doing, kept where it can be read later.
 *
 * Every failure used to go to `console.error` and nowhere else. On Vercel that
 * is the runtime log, which keeps an hour or a day of output depending on the
 * plan -- so a professor saying "it broke on Tuesday" was a report about
 * something that had already been thrown away. This writes the same things to
 * the `app_log` tab of the sheet the app already lives in: no second service
 * to sign up for, and the admin reads it in Settings → Logs.
 *
 * Three levels:
 * - `error` -- something failed that should not have: a page that would not
 *   render, an action that threw, a sync that did not go through.
 * - `warn` -- the app said no and meant it (a conflict, a missing permission,
 *   a wrong password). Not a bug, but the first thing to look at when somebody
 *   says "it would not let me".
 * - `info` -- usage: who signed in, which pages they opened. The trail that
 *   leads up to an error, and the answer to "is anybody using this?".
 *
 * ## Quota
 *
 * The sheet allows the service account 60 writes a minute, shared with every
 * save anybody makes. A row per event would let a busy minute of page views
 * crowd out real work, so rows wait here and go out together: one append every
 * FLUSH_GAP_MS at most, per server instance, however many rows it carries. An
 * error asks for the next slot rather than waiting out the delay a page view
 * does, because a request that failed is the likeliest to be the last thing an
 * instance does.
 *
 * ## Never in the way
 *
 * Nothing here throws. A log that cannot be written is printed to the console
 * and dropped: the page somebody is looking at matters more than the record of
 * it. That includes the case the log would most like to record -- the sheet
 * itself being down -- where the console is the only place left.
 */

export type LogLevel = 'error' | 'warn' | 'info';

export type LogEntry = {
  level: LogLevel;
  /** What kind of thing happened -- 'server_error', 'sign_in', 'view'... */
  event: string;
  message?: string;
  userId?: string;
  /** Where it happened. A full URL or a path with a query string is fine; only the path is kept. */
  path?: string;
  /** Anything that helps reproduce it. Stored as JSON. */
  detail?: Record<string, unknown>;
};

const TAB = 'app_log';

/** How long a page view waits for company before it is written. */
const FLUSH_DELAY_MS = 5_000;

/** Appends are at least this far apart per instance -- errors included. */
const FLUSH_GAP_MS = 5_000;

/** Held at most, oldest dropped first, while the sheet cannot be reached. */
const MAX_BUFFERED = 500;

/**
 * Rows one event may write per minute, and per day, per instance.
 *
 * A loop -- an error on every request while the sheet is down, somebody
 * guessing passwords -- would otherwise fill the tab with the same line. Sixty
 * of one thing in a minute is enough to see the pattern. The daily ceiling is
 * for what a minute's limit allows over a day: somebody posting junk to a
 * public endpoint without pause must not be able to grow the sheet without
 * end, because a spreadsheet that reaches Google's cell limit stops taking
 * the app's real writes too.
 */
const MAX_PER_EVENT_PER_MINUTE = 60;
const MAX_PER_EVENT_PER_DAY = 5_000;

/** A cell holds 50,000 characters; a stack trace does not need that many. */
const MAX_MESSAGE = 1_000;
const MAX_DETAIL = 20_000;
const MAX_PATH = 300;
const MAX_STACK_LINES = 30;

let buffer: string[][] = [];
let writing: Promise<void> = Promise.resolve();
let lastWriteAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDue = 0;
let timerDone: Promise<void> | null = null;
let resolveTimer: (() => void) | null = null;
const perEvent = new Map<string, { minuteStart: number; minute: number; dayStart: number; day: number }>();

/**
 * Whether there is a sheet to write to at all.
 *
 * Without one -- tests, a checkout with no .env.local -- the console is the
 * whole log, as it always was.
 */
function canPersist(): boolean {
  return Boolean(process.env.SPREADSHEET_ID && process.env.SERVICE_ACCOUNT_JSON);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** "/tasks" from "https://host/tasks?x=1", "/tasks?x=1" or "/tasks". */
export function pathOnly(value: string | null | undefined): string {
  if (!value) return '';
  let path = value;
  try {
    path = new URL(value, 'http://x').pathname;
  } catch {
    path = value.split(/[?#]/)[0];
  }
  return truncate(path, MAX_PATH);
}

/**
 * An error as plain data, keeping only what is safe to store.
 *
 * Deliberately a short list of fields rather than everything on the object. A
 * Google API error carries the request it failed on -- `config.headers`
 * included, which is the service account's access token -- and copying the
 * whole object into a sheet would publish that to anybody who can open it.
 */
export function describeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      // Thrown objects that look like errors (a rejected fetch in some
      // browsers, a library's own shape) still say what they are.
      if (typeof e.message === 'string') {
        return { message: truncate(e.message, MAX_MESSAGE) };
      }
    }
    return { message: truncate(String(error), MAX_MESSAGE) };
  }

  const out: Record<string, unknown> = {
    name: error.name,
    message: truncate(error.message, MAX_MESSAGE),
  };
  if (error.stack) {
    out.stack = error.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n');
  }

  const extra = error as Error & { digest?: unknown; code?: unknown; status?: unknown };
  if (typeof extra.digest === 'string') out.digest = extra.digest;
  if (typeof extra.code === 'string' || typeof extra.code === 'number') out.code = extra.code;
  if (typeof extra.status === 'number') out.status = extra.status;

  if (error.cause !== undefined && depth < 3) {
    out.cause = describeError(error.cause, depth + 1);
  }
  return out;
}

/** One entry as a sheet row, in SCHEMAS order. Every cell a string. */
export function toLogRow(entry: LogEntry, now: Date = new Date()): string[] {
  const at = now.toISOString();
  const detail = entry.detail && Object.keys(entry.detail).length > 0
    ? truncate(JSON.stringify(entry.detail), MAX_DETAIL)
    : '';

  const cells: Record<string, string> = {
    id: crypto.randomUUID(),
    created_at: at,
    updated_at: at,
    row_version: '1',
    created_by: entry.userId || 'system',
    level: entry.level,
    event: entry.event,
    user_id: entry.userId ?? '',
    path: pathOnly(entry.path),
    message: truncate(entry.message ?? '', MAX_MESSAGE),
    detail,
  };
  return SCHEMAS.app_log.map((h) => cells[h] ?? '');
}

/** False once an event has written its share for this minute, or this day. */
function withinRate(event: string, now: number): boolean {
  let slot = perEvent.get(event);
  if (!slot) {
    slot = { minuteStart: now, minute: 0, dayStart: now, day: 0 };
    perEvent.set(event, slot);
  }
  if (now - slot.minuteStart >= 60_000) {
    slot.minuteStart = now;
    slot.minute = 0;
  }
  if (now - slot.dayStart >= 24 * 60 * 60_000) {
    slot.dayStart = now;
    slot.day = 0;
  }

  slot.minute += 1;
  slot.day += 1;
  if (slot.minute === MAX_PER_EVENT_PER_MINUTE + 1) {
    console.warn(`app log: more than ${MAX_PER_EVENT_PER_MINUTE} "${event}" this minute; the rest are not stored`);
  }
  if (slot.day === MAX_PER_EVENT_PER_DAY + 1) {
    console.warn(`app log: more than ${MAX_PER_EVENT_PER_DAY} "${event}" today; the rest are not stored`);
  }
  return slot.minute <= MAX_PER_EVENT_PER_MINUTE && slot.day <= MAX_PER_EVENT_PER_DAY;
}

/**
 * Hold the request open until `work` is done.
 *
 * On Vercel a function can be frozen the moment its response is sent, taking
 * a pending write with it. `after` is how Next asks the platform to wait.
 * Outside a request -- a script, a test -- there is nothing to extend, and the
 * write simply runs.
 */
function keepAlive(work: Promise<unknown>): void {
  try {
    after(() => work);
  } catch {
    // Not inside a request.
  }
}

/**
 * Write what is waiting no sooner than `delay` from now, nor sooner than
 * FLUSH_GAP_MS after the last write. Resolves once it has been written.
 *
 * Asking again for an earlier time moves the one pending write forward; asking
 * for a later one joins it. Either way there is only ever one waiting.
 */
export function requestFlush(delay: number): Promise<void> {
  const due = Math.max(Date.now() + delay, lastWriteAt + FLUSH_GAP_MS);
  if (timerDone && timerDue <= due) return timerDone;

  if (timer) clearTimeout(timer);
  if (!timerDone) timerDone = new Promise<void>((resolve) => (resolveTimer = resolve));
  const done = timerDone;
  timerDue = due;

  timer = setTimeout(() => {
    const resolve = resolveTimer;
    timer = null;
    timerDone = null;
    resolveTimer = null;
    void flushAppLog().then(() => resolve?.());
  }, Math.max(0, due - Date.now()));
  // A script that logged something should not have to wait to exit.
  (timer as { unref?: () => void }).unref?.();

  return done;
}

/** Record something. Returns at once; the row is written shortly after. */
export function logEvent(entry: LogEntry): void {
  try {
    if (!canPersist()) return;
    if (!withinRate(entry.event, Date.now())) return;

    buffer.push(toLogRow(entry));
    if (buffer.length > MAX_BUFFERED) buffer.splice(0, buffer.length - MAX_BUFFERED);

    keepAlive(requestFlush(entry.level === 'error' ? 0 : FLUSH_DELAY_MS));
  } catch (error) {
    console.error('app log: could not record an entry:', error);
  }
}

/**
 * Record a failure, and print it as `console.error(message, error)` did.
 *
 * The drop-in for the `console.error` calls this replaced: the server log
 * reads the same as before, and the sheet gets a copy with the stack.
 */
export function logError(
  event: string,
  error: unknown,
  context: {
    message?: string;
    userId?: string;
    path?: string;
    detail?: Record<string, unknown>;
    level?: Exclude<LogLevel, 'info'>;
    /** Not printed: for an error something else has already printed. */
    quiet?: boolean;
  } = {}
): void {
  const level = context.level ?? 'error';
  const described = describeError(error);
  const label = context.message ?? event;

  if (!context.quiet) {
    if (level === 'error') console.error(`${label}:`, error);
    else console.warn(`${label}:`, error);
  }

  logEvent({
    level,
    event,
    message: context.message ? `${context.message}: ${String(described.message ?? '')}` : String(described.message ?? ''),
    userId: context.userId,
    path: context.path,
    detail: { ...context.detail, error: described, env: process.env.VERCEL_ENV ?? process.env.NODE_ENV },
  });
}

/**
 * Write whatever is waiting, now, ignoring the gap. Never rejects.
 *
 * For the end of a script or a test. Everything else goes through
 * requestFlush, which keeps writes spaced out.
 */
export function flushAppLog(): Promise<void> {
  const run = writing.then(async () => {
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    lastWriteAt = Date.now();
    try {
      await appendRows(rows);
    } catch (error) {
      console.error(`app log: could not write ${rows.length} row(s) to the sheet:`, error);
    }
  });
  writing = run;
  return run;
}

function isMissingTab(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  const badRequest = e?.status === 400 || e?.code === 400;
  return badRequest && typeof e.message === 'string' && e.message.includes('Unable to parse range');
}

async function appendRows(rows: string[][]): Promise<void> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  // RAW: a message beginning with "=" is text, never a formula. Some of these
  // strings come from the browser.
  const append = () =>
    sheets.spreadsheets.values.append(
      {
        spreadsheetId,
        range: `${TAB}!A1`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      },
      { timeout: 10_000 }
    );

  try {
    await append();
  } catch (error) {
    if (!isMissingTab(error)) throw error;
    // Deployed before `npm run db:migrate-schema` was run. The log is the one
    // tab worth creating on the spot: the first errors after a release are
    // the ones most worth keeping.
    await createTab(sheets, spreadsheetId);
    await append();
  }
}

async function createTab(
  sheets: Awaited<ReturnType<typeof getSheetsApi>>,
  spreadsheetId: string
): Promise<void> {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
  } catch (error) {
    // Another instance got there first. Its header is the same as ours.
    const message = (error as { message?: unknown })?.message;
    if (!(typeof message === 'string' && message.includes('already exists'))) throw error;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB}!1:1`,
    valueInputOption: 'RAW',
    requestBody: { values: [[...SCHEMAS.app_log]] },
  });
}

/** Test seam: forget everything waiting and every rate window. */
export function resetAppLog(): void {
  if (timer) clearTimeout(timer);
  resolveTimer?.();
  buffer = [];
  writing = Promise.resolve();
  lastWriteAt = 0;
  timer = null;
  timerDue = 0;
  timerDone = null;
  resolveTimer = null;
  perEvent.clear();
}
