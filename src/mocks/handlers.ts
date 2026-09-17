import { http, HttpResponse } from 'msw';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const META_ROWS = [
  ['id', 'created_at', 'updated_at', 'row_version', 'created_by', 'key', 'value'],
  ['1', '2023-01-01', '2023-01-01', '1', 'system', 'test_key', 'test_value'],
];

export const batchUpdateCalls: unknown[] = [];

export const handlers = [
  // values.get -- note ":batchUpdate" style suffixes are matched separately below.
  http.get(`${BASE}/:spreadsheetId/values/:range`, () =>
    HttpResponse.json({ values: META_ROWS })
  ),

  http.get(`${BASE}/:spreadsheetId/values:batchGet`, () =>
    HttpResponse.json({
      valueRanges: [
        { values: META_ROWS }
      ]
    })
  ),

  http.get(`${BASE}/:spreadsheetId`, () =>
    HttpResponse.json({
      sheets: [
        { properties: { title: 'meta', sheetId: 1 } },
        { properties: { title: 'audit_log', sheetId: 2 } },
        { properties: { title: 'users', sheetId: 3 } },
        { properties: { title: 'tasks', sheetId: 4 } },
      ],
    })
  ),

  // The ":batchUpdate" verb is a literal suffix on the spreadsheet id, not a
  // path segment -- the previous pattern never matched.
  http.post(`${BASE}/:spreadsheetId\\:batchUpdate`, async ({ request }) => {
    batchUpdateCalls.push(await request.json());
    return HttpResponse.json({ spreadsheetId: 'test_id', replies: [] });
  }),
];
