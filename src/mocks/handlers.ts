import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId/values/:range', () => {
    return HttpResponse.json({
      values: [
        ['id', 'created_at', 'updated_at', 'row_version', 'created_by', 'key', 'value'],
        ['1', '2023-01-01', '2023-01-01', '1', 'system', 'test_key', 'test_value']
      ]
    });
  }),
  
  http.get('https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId', () => {
    return HttpResponse.json({
      sheets: [
        { properties: { title: 'meta', sheetId: 1 } },
        { properties: { title: 'audit_log', sheetId: 2 } }
      ]
    });
  }),
  
  http.post('https://sheets.googleapis.com/v4/spreadsheets/:spreadsheetId:batchUpdate', () => {
    return HttpResponse.json({
      spreadsheetId: 'test_id',
      replies: []
    });
  })
];
