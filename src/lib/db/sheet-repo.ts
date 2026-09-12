import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { writeQueue } from './write-queue';
import { SCHEMAS, TableName, BaseRecord } from './schema';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// In-memory read cache (TTL 60s)
const CACHE_TTL = 60 * 1000;
const cache = new Map<string, { data: any[]; timestamp: number }>();
const sheetIdCache = new Map<string, number>();

function makeRowData(arr: any[]) {
  return {
    values: arr.map(v => ({ userEnteredValue: { stringValue: String(v) } }))
  };
}

function buildAuditRow(actorId: string, entity: string, entityId: string, action: string, oldVal: any, newVal: any, now: string) {
  const al: Record<string, any> = {
    id: crypto.randomUUID(),
    actor_id: actorId,
    entity,
    entity_id: entityId,
    action,
    old: oldVal ? JSON.stringify(oldVal) : '',
    new: newVal ? JSON.stringify(newVal) : '',
    at: now,
    created_at: now,
    updated_at: now,
    row_version: 1,
    created_by: actorId
  };
  return SCHEMAS['audit_log'].map(h => String(al[h] || ''));
}

async function getSheetId(sheets: any, spreadsheetId: string, title: string): Promise<number> {
  const cached = sheetIdCache.get(title);
  if (cached !== undefined) return cached;
  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  for (const s of sheetInfo.data.sheets || []) {
    if (s.properties?.title && s.properties?.sheetId !== undefined) {
      sheetIdCache.set(s.properties.title, s.properties.sheetId);
    }
  }
  const id = sheetIdCache.get(title);
  if (id === undefined) throw new Error(`Sheet not found: ${title}`);
  return id;
}

export class SheetRepo {
  static async getRawValues(tabName: string): Promise<any[][]> {
    const sheets = await getSheetsApi();
    const spreadsheetId = getSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:ZZ`,
    });
    return res.data.values || [];
  }

  static async find<T extends BaseRecord>(tabName: TableName): Promise<T[]> {
    const cacheKey = tabName;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T[];
    }

    const values = await this.getRawValues(tabName);
    if (!values || values.length <= 1) return [];

    const headers = values[0];
    const rows = values.slice(1);
    
    const data = rows.map(row => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => {
        let val = row[i];
        if (val === 'TRUE') val = true;
        else if (val === 'FALSE') val = false;
        else if (val && (val.startsWith('{') || val.startsWith('['))) {
          try { val = JSON.parse(val); } catch (e) {}
        }
        else if (h === 'row_version') val = parseInt(val, 10);
        obj[h] = val;
      });
      return obj as T;
    });

    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  }

  static async findOne<T extends BaseRecord>(tabName: TableName, id: string): Promise<T | null> {
    const all = await this.find<T>(tabName);
    return all.find(r => r.id === id) || null;
  }

  static async insert<T extends Partial<BaseRecord>>(tabName: TableName, record: T, actorId: string = 'system'): Promise<T> {
    return writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();
      
      const newId = record.id || crypto.randomUUID();
      const now = new Date().toISOString();
      const headers = SCHEMAS[tabName];
      
      const toInsert: any = {
        ...record,
        id: newId,
        created_at: now,
        updated_at: now,
        row_version: 1,
        created_by: actorId
      };

      const rowData = headers.map(h => {
        let val = toInsert[h];
        if (val === undefined || val === null) return '';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });

      const auditLogData = buildAuditRow(actorId, tabName, newId, 'INSERT', null, toInsert, now);
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { appendCells: { sheetId: mainSheetId, rows: [makeRowData(rowData)], fields: '*' } },
            { appendCells: { sheetId: auditSheetId, rows: [makeRowData(auditLogData)], fields: '*' } }
          ]
        }
      });

      cache.delete(tabName);
      cache.delete('audit_log');
      return toInsert as T;
    });
  }

  static async update<T extends BaseRecord>(tabName: TableName, id: string, record: Partial<T>, actorId: string = 'system'): Promise<T> {
    return writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();
      
      const values = await this.getRawValues(tabName);
      if (!values || values.length <= 1) throw new Error('Not found');
      const headers = values[0];
      
      const rowIndex = values.findIndex(r => r[0] === id);
      if (rowIndex === -1) throw new Error('Not found');
      
      const currentRow = values[rowIndex];
      const versionIdx = headers.indexOf('row_version');
      const currentVersion = parseInt(currentRow[versionIdx], 10);
      
      if (record.row_version && record.row_version !== currentVersion) {
        throw new ConflictError('Optimistic concurrency error: row_version mismatch');
      }
      
      const now = new Date().toISOString();
      const updated: any = {};
      headers.forEach((h: string, i: number) => {
        let val = currentRow[i];
        if (h === 'row_version') val = currentVersion + 1;
        else if (h === 'updated_at') val = now;
        else if (record[h as keyof T] !== undefined) val = record[h as keyof T];
        
        if (val && (val.toString().startsWith('{') || val.toString().startsWith('['))) {
           try { val = typeof val === 'string' ? JSON.parse(val) : val; } catch(e) {}
        }
        updated[h] = val;
      });

      const rowData = headers.map((h: string) => {
        let val = updated[h];
        if (val === undefined || val === null) return '';
        if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });

      const oldObj: any = {};
      headers.forEach((h: string, i: number) => { oldObj[h] = currentRow[i]; });

      const auditLogData = buildAuditRow(actorId, tabName, id, 'UPDATE', oldObj, updated, now);
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { 
              updateCells: { 
                range: { 
                  sheetId: mainSheetId,
                  startRowIndex: rowIndex, endRowIndex: rowIndex + 1,
                  startColumnIndex: 0, endColumnIndex: headers.length
                }, 
                rows: [makeRowData(rowData)], fields: '*' 
              } 
            },
            { appendCells: { sheetId: auditSheetId, rows: [makeRowData(auditLogData)], fields: '*' } }
          ]
        }
      });

      cache.delete(tabName);
      cache.delete('audit_log');
      return updated as T;
    });
  }
}
