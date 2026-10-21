import { getSheetsApi, getSpreadsheetId } from './db/sheet-client';
import { toDescendingRanges } from './db/row-ranges';

/**
 * How long the app log keeps each level, in days.
 *
 * Page views are the bulk of it and only matter while somebody might still
 * ask what led up to an error; a month covers that. Errors and refusals are
 * few, and "has this happened before?" is worth answering across a term.
 */
export const KEEP_DAYS = { info: 30, warn: 180, error: 180 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Grid row indexes (the header is row 0) of rows past their keep-by date.
 *
 * Takes the tab as read, header first. A row whose date cannot be read is
 * kept -- an unreadable date is not evidence of age -- and a level this code
 * does not know is kept as long as an error.
 */
export function expiredLogRows(rows: string[][], now: number): number[] {
  if (rows.length <= 1) return [];
  const header = rows[0].map(String);
  const at = header.indexOf('created_at');
  const level = header.indexOf('level');
  if (at === -1) return [];

  const expired: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const time = Date.parse(String(rows[i]?.[at] ?? ''));
    if (Number.isNaN(time)) continue;
    const lvl = level === -1 ? '' : String(rows[i]?.[level] ?? '');
    const days = lvl === 'info' ? KEEP_DAYS.info : lvl === 'warn' ? KEEP_DAYS.warn : KEEP_DAYS.error;
    if (now - time > days * DAY_MS) expired.push(i);
  }
  return expired;
}

/**
 * Delete what expiredLogRows names. Run once a day from /api/cron.
 *
 * Straight to the Sheets API, like scripts/trim-audit-log.ts and for the same
 * reason: nothing reads the rows going, and a delete through SheetRepo would
 * write an audit row for each. Rows arriving meanwhile are appended below the
 * ones read here, so the indexes taken stay true.
 */
export async function trimAppLog(now: number = Date.now()): Promise<{ deleted: number; kept: number }> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === 'app_log')?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return { deleted: 0, kept: 0 };

  // The first six columns reach `level`; `detail`, the wide one, stays behind.
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'app_log!A:F' });
  const rows = (res.data.values ?? []) as string[][];
  const expired = expiredLogRows(rows, now);
  const kept = Math.max(0, rows.length - 1 - expired.length);
  if (expired.length === 0) return { deleted: 0, kept };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: toDescendingRanges(expired).map((r) => ({
        deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: r.start, endIndex: r.end } },
      })),
    },
  });
  return { deleted: expired.length, kept };
}
