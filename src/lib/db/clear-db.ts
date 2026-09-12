import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { SCHEMAS } from './schema';
import { SheetRepo } from './sheet-repo';

/**
 * Delete every data row while leaving the header rows intact.
 *
 * This is the counterpart to initDatabase(): once the sheet is empty again,
 * the db:init guard unlocks. Headers stay because clearing starts at row 2 --
 * a full wipe would also destroy the column layout that the data rows are
 * written against.
 *
 * Destructive and irreversible. Callers must re-authenticate the operator
 * before calling; see clearDatabaseAction.
 */
export async function clearDatabase(): Promise<{ clearedTabs: string[] }> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const present = new Set(
    (info.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[]
  );
  const existing = Object.keys(SCHEMAS).filter((t) => present.has(t));
  if (existing.length === 0) return { clearedTabs: [] };

  // A2 downward: row 1 is the header.
  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: { ranges: existing.map((t) => `${t}!A2:Z`) },
  });

  // Reads are memoised, so a stale cache would keep serving the deleted rows.
  SheetRepo.clearCache();

  return { clearedTabs: existing };
}
