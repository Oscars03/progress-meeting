import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { SCHEMAS } from './schema';
import { hashPassword } from '../password';
import { UserError } from '../user-error';

type SeedUser = { name: string; email: string; role: string };

const SEED_USERS: SeedUser[] = [
  { name: 'ผู้ดูแลระบบ (Admin)', email: 'admin@test.com', role: 'admin' },
  { name: 'อาจารย์สมชาย', email: 'prof1@test.com', role: 'professor' },
  { name: 'อาจารย์สมศรี', email: 'prof2@test.com', role: 'professor' },
  { name: 'นักศึกษา ก (Lead)', email: 'student1@test.com', role: 'student' },
  { name: 'นักศึกษา ข', email: 'student2@test.com', role: 'student' },
  { name: 'นักศึกษา ค', email: 'student3@test.com', role: 'student' },
  { name: 'นักศึกษา ง', email: 'student4@test.com', role: 'student' },
  { name: 'นักศึกษา จ', email: 'student5@test.com', role: 'student' },
];

/**
 * Password for the seeded demo accounts. Override with SEED_PASSWORD.
 * Stored as a bcrypt hash like any other password -- there is no code path
 * that accepts it without a hash comparison.
 */
function seedPassword(): string {
  return process.env.SEED_PASSWORD || 'changeme123';
}

/** Raised when initDatabase() would rewrite headers over a sheet that already holds data. */
export class DatabaseAlreadyInitializedError extends UserError {
  readonly populatedTabs: string[];
  constructor(populatedTabs: string[]) {
    const tabs = populatedTabs.join(', ');
    super('settings.dbAlreadyInitialized', { tabs }, `Database already holds data in: ${tabs}`);
    this.name = 'DatabaseAlreadyInitializedError';
    this.populatedTabs = populatedTabs;
  }
}

/**
 * Which known tabs already hold data rows (anything below the header).
 *
 * initDatabase() rewrites every header row in place while leaving the data
 * rows untouched, so running it over a populated sheet can shift every value
 * out from under its column. Callers use this to refuse by default.
 */
export async function getPopulatedTabs(): Promise<string[]> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabs = Object.keys(SCHEMAS);

  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const present = new Set(
    (info.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[]
  );
  const existing = tabs.filter((t) => present.has(t));
  if (existing.length === 0) return [];

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: existing.map((t) => `${t}!A1:A2`),
  });

  const populated: string[] = [];
  (res.data.valueRanges ?? []).forEach((vr, i) => {
    // More than the header row means real data sits underneath.
    if ((vr.values?.length ?? 0) > 1) populated.push(existing[i]);
  });
  return populated;
}

export async function initDatabase(options: { force?: boolean } = {}) {
  const populated = await getPopulatedTabs();
  if (populated.length > 0 && !options.force) {
    throw new DatabaseAlreadyInitializedError(populated);
  }

  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = (sheetInfo.data.sheets ?? []).map((s) => s.properties?.title);

  const addRequests = Object.keys(SCHEMAS)
    .filter((tab) => !existingSheets.includes(tab))
    .map((tab) => ({ addSheet: { properties: { title: tab } } }));

  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: addRequests } });
  }

  const newSheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const headerRequests = [];

  for (const [tab, headers] of Object.entries(SCHEMAS)) {
    const sheet = newSheetInfo.data.sheets?.find((s) => s.properties?.title === tab);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) continue;

    headerRequests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length,
        },
        rows: [
          {
            values: headers.map((h) => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: { textFormat: { bold: true } },
            })),
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat.textFormat.bold',
      },
    });

    headerRequests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    });
  }

  if (headerRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: headerRequests },
    });
  }

  // Seed demo users only when the tab is empty.
  const usersRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'users!A:A' });
  let seededCount = 0;

  if (!usersRes.data.values || usersRes.data.values.length <= 1) {
    const now = new Date().toISOString();
    const hash = await hashPassword(seedPassword());

    const usersData = SEED_USERS.map((u) => {
      const row: Record<string, string> = {
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        row_version: '1',
        created_by: 'system',
        name: u.name,
        email: u.email,
        password_hash: hash,
        role: u.role,
        team_id: '',
        line_id: '',
        active: 'TRUE',
      };
      return SCHEMAS.users.map((h) => row[h] ?? '');
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'users!A:Z',
      valueInputOption: 'RAW',
      requestBody: { values: usersData },
    });
    seededCount = usersData.length;
  }

  return { success: true, seededCount };
}
