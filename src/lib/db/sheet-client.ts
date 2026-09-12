import { google } from 'googleapis';

let authClient: any = null;
let sheetsApi: any = null;

export async function getSheetsApi() {
  if (sheetsApi) return sheetsApi;

  const credentialsStr = process.env.SERVICE_ACCOUNT_JSON;
  if (!credentialsStr) {
    throw new Error('SERVICE_ACCOUNT_JSON is not defined in environment variables');
  }

  const credentials = JSON.parse(credentialsStr);
  
  authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsApi = google.sheets({ version: 'v4', auth: authClient });
  return sheetsApi;
}

export function getSpreadsheetId() {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('SPREADSHEET_ID is not defined');
  return id;
}
