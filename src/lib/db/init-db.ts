import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { SCHEMAS } from './schema';
import { hashPassword } from '../password';

type SeedUser = { name: string; email: string; role: string };

const SEED_USERS: SeedUser[] = [
  { name: 'ผู้ดูแลระบบ (Admin)', email: 'admin@test.com', role: 'admin' },
  { name: 'อาจารย์สมชาย', email: 'prof1@test.com', role: 'manager' },
  { name: 'อาจารย์สมศรี', email: 'prof2@test.com', role: 'manager' },
  { name: 'นักศึกษา ก (Lead)', email: 'student1@test.com', role: 'manager' },
  { name: 'นักศึกษา ข', email: 'student2@test.com', role: 'member' },
  { name: 'นักศึกษา ค', email: 'student3@test.com', role: 'member' },
  { name: 'นักศึกษา ง', email: 'student4@test.com', role: 'member' },
  { name: 'นักศึกษา จ', email: 'student5@test.com', role: 'member' },
];

/**
 * Password for the seeded demo accounts. Override with SEED_PASSWORD.
 * Stored as a bcrypt hash like any other password -- there is no code path
 * that accepts it without a hash comparison.
 */
function seedPassword(): string {
  return process.env.SEED_PASSWORD || 'changeme123';
}

export async function initDatabase() {
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
