import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { SCHEMAS } from './schema';

export async function initDatabase() {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = sheetInfo.data.sheets?.map((s: any) => s.properties?.title) || [];

  const requests: any[] = [];
  const tabs = Object.keys(SCHEMAS);

  for (const tab of tabs) {
    if (!existingSheets.includes(tab)) {
      requests.push({ addSheet: { properties: { title: tab } } });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }

  const newSheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const headerRequests: any[] = [];

  for (const [tab, headers] of Object.entries(SCHEMAS)) {
    const sheet = newSheetInfo.data.sheets?.find((s: any) => s.properties?.title === tab);
    if (!sheet) continue;
    const sheetId = sheet.properties?.sheetId;

    headerRequests.push({
      updateCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
        rows: [{ values: headers.map(h => ({ userEnteredValue: { stringValue: h }, userEnteredFormat: { textFormat: { bold: true } } })) }],
        fields: 'userEnteredValue,userEnteredFormat.textFormat.bold'
      }
    });

    headerRequests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount'
      }
    });
  }

  if (headerRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: headerRequests } });
  }

  // Seed demo data if users empty
  const usersRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'users!A:A' });
  let seededCount = 0;
  if (!usersRes.data.values || usersRes.data.values.length <= 1) {
    const now = new Date().toISOString();
    const usersData = [
      [crypto.randomUUID(), now, now, 1, 'system', 'ผู้ดูแลระบบ (Admin)', 'admin@test.com', 'password', 'admin', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'อาจารย์สมชาย', 'prof1@test.com', 'password', 'manager', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'อาจารย์สมศรี', 'prof2@test.com', 'password', 'manager', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'นักศึกษา ก (Lead)', 'student1@test.com', 'password', 'manager', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'นักศึกษา ข', 'student2@test.com', 'password', 'member', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'นักศึกษา ค', 'student3@test.com', 'password', 'member', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'นักศึกษา ง', 'student4@test.com', 'password', 'member', '', '', 'TRUE'],
      [crypto.randomUUID(), now, now, 1, 'system', 'นักศึกษา จ', 'student5@test.com', 'password', 'member', '', '', 'TRUE'],
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId, range: 'users!A:Z', valueInputOption: 'RAW',
      requestBody: { values: usersData }
    });
    seededCount = usersData.length;
  }

  return { success: true, seededCount };
}
