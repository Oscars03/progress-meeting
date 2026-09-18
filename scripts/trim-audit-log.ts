/**
 * Keep `audit_log` from growing without end.
 *
 * It is the largest table in the database by a long way -- 389 of 439 rows
 * when this was written, 89% of everything -- and the app never reads it. It
 * is written on every insert, update and delete, and nothing ever takes a row
 * out again.
 *
 * This deletes rows older than a cut-off. Ninety days by default: long enough
 * that "what happened to this row last term" is still answerable, short enough
 * that the tab stops being most of the database.
 *
 * ## Why this does not use SheetRepo
 *
 * `SheetRepo.delete` writes an audit row recording the deletion. Removing 300
 * audit rows through it would write 300 new audit rows, which is worse than
 * doing nothing. A log cannot be pruned by the thing that appends to it.
 *
 * So this talks to the Sheets API directly. CLAUDE.md calls that the right
 * tool for a one-off repair and the wrong one for anything the app can do
 * itself -- and the app cannot do this one. It is also safe here in a way it
 * is not elsewhere: nothing reads `audit_log`, so no `row_version` is being
 * bypassed and no reader can see a torn state.
 *
 *   npm run db:trim-audit -- --dry-run      print what would go
 *   npm run db:trim-audit                   delete rows older than 90 days
 *   npm run db:trim-audit -- --days=30      a different cut-off
 */

import { getSheetsApi, getSpreadsheetId } from '../src/lib/db/sheet-client';
import { SCHEMAS } from '../src/lib/db/schema';
import { toDescendingRanges } from '../src/lib/db/row-ranges';

const DEFAULT_DAYS = 90;

function parseArgs(argv: string[]): { dryRun: boolean; days: number } {
  const dryRun = argv.includes('--dry-run');
  const daysArg = argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Number(daysArg.slice('--days='.length)) : DEFAULT_DAYS;

  if (!Number.isFinite(days) || days < 1) {
    throw new Error(`--days must be a positive number, got ${daysArg ?? '(none)'}`);
  }
  return { dryRun, days };
}

async function main() {
  const { dryRun, days } = parseArgs(process.argv.slice(2));

  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const tab = meta.data.sheets?.find((s) => s.properties?.title === 'audit_log');
  if (!tab?.properties?.sheetId && tab?.properties?.sheetId !== 0) {
    throw new Error('No audit_log tab in this spreadsheet');
  }
  const sheetId = tab.properties.sheetId;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'audit_log',
  });
  const rows = res.data.values ?? [];
  if (rows.length <= 1) {
    console.log('audit_log is empty; nothing to do');
    return;
  }

  const header = rows[0].map(String);
  // `at` is the audit row's own timestamp; `created_at` is the same instant and
  // is there on every table. Either will do, whichever this sheet has.
  const timeColumn = ['at', 'created_at'].map((h) => header.indexOf(h)).find((i) => i >= 0);
  if (timeColumn === undefined) {
    throw new Error(
      `audit_log has no 'at' or 'created_at' column. Header: ${header.join(', ')}. ` +
        `Expected: ${SCHEMAS.audit_log.join(', ')}`
    );
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffLabel = new Date(cutoff).toISOString().slice(0, 10);

  // Row 0 is the header and never goes. A row whose timestamp cannot be read
  // is kept: a log entry is cheap and an unreadable date is not evidence of
  // age.
  const doomed: number[] = [];
  let unreadable = 0;

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i]?.[timeColumn];
    const at = raw ? Date.parse(String(raw)) : NaN;
    if (Number.isNaN(at)) {
      unreadable++;
      continue;
    }
    if (at < cutoff) doomed.push(i);
  }

  const kept = rows.length - 1 - doomed.length;
  console.log(`audit_log: ${rows.length - 1} rows`);
  console.log(`cut-off:   older than ${cutoffLabel} (${days} days)`);
  console.log(`to delete: ${doomed.length}`);
  console.log(`to keep:   ${kept}${unreadable ? ` (${unreadable} with an unreadable date, kept)` : ''}`);

  if (doomed.length === 0) return;

  const ranges = toDescendingRanges(doomed);
  console.log(`ranges:    ${ranges.length}`);

  if (dryRun) {
    console.log('\n--dry-run: nothing was deleted');
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: ranges.map((r) => ({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: r.start, endIndex: r.end },
        },
      })),
    },
  });

  console.log(`\ndeleted ${doomed.length} rows; ${kept} remain`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
