import { google, type sheets_v4 } from 'googleapis';

let sheetsApi: sheets_v4.Sheets | null = null;

export async function getSheetsApi(): Promise<sheets_v4.Sheets> {
  if (sheetsApi) return sheetsApi;

  const credentialsStr = process.env.SERVICE_ACCOUNT_JSON;
  if (!credentialsStr) {
    throw new Error('SERVICE_ACCOUNT_JSON is not defined in environment variables');
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(credentialsStr);
  } catch {
    throw new Error('SERVICE_ACCOUNT_JSON is not valid JSON');
  }

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsApi = google.sheets({ version: 'v4', auth: authClient });
  return sheetsApi;
}

export function getSpreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not defined');
  return id;
}

/** Test seam: drop the memoised client. */
export function resetSheetsApi(): void {
  sheetsApi = null;
}
