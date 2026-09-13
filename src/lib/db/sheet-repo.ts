import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { writeQueue } from './write-queue';
import { UserError } from '../user-error';
import {
  SCHEMAS,
  assertHasCommonColumns,
  type TableName,
  type AnyRecord,
  type BaseRecord,
  type CellValue,
} from './schema';

/** Someone else wrote the row since it was read. The detail is for logs. */
export class ConflictError extends UserError {
  constructor(detail: string) {
    super('error.conflict', undefined, detail);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends UserError {
  constructor(detail: string) {
    super('error.notFound', undefined, detail);
    this.name = 'NotFoundError';
  }
}

// In-memory read cache (TTL 60s). Per-process only: on a multi-instance deploy
// another instance may serve rows up to TTL stale. `row_version` is the real
// concurrency control, not this cache.
const CACHE_TTL = 60 * 1000;
const cache = new Map<string, { data: AnyRecord[]; timestamp: number }>();
const sheetIdCache = new Map<string, number>();

type SheetsApi = Awaited<ReturnType<typeof getSheetsApi>>;
type RawRow = string[];

function makeRowData(arr: string[]) {
  return { values: arr.map((v) => ({ userEnteredValue: { stringValue: v } })) };
}

/** Serialise one value for a sheet cell. Always a string cell, never a formula. */
function toCell(val: CellValue): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/** Parse one sheet cell back into a value. */
function fromCell(header: string, raw: string | undefined): CellValue {
  if (raw === undefined || raw === '') {
    return header === 'row_version' ? 0 : '';
  }
  if (raw === 'TRUE') return true;
  if (raw === 'FALSE') return false;
  if (header === 'row_version') {
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw) as CellValue;
    } catch {
      return raw;
    }
  }
  return raw;
}

function buildAuditRow(
  actorId: string,
  entity: string,
  entityId: string,
  action: string,
  oldVal: unknown,
  newVal: unknown,
  now: string
): string[] {
  const al: Record<string, CellValue> = {
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
    created_by: actorId,
  };
  return SCHEMAS.audit_log.map((h) => toCell(al[h]));
}

async function getSheetId(sheets: SheetsApi, spreadsheetId: string, title: string): Promise<number> {
  const cached = sheetIdCache.get(title);
  if (cached !== undefined) return cached;

  const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  for (const s of sheetInfo.data.sheets ?? []) {
    const t = s.properties?.title;
    const id = s.properties?.sheetId;
    if (t && id !== undefined && id !== null) sheetIdCache.set(t, id);
  }

  const id = sheetIdCache.get(title);
  if (id === undefined) throw new NotFoundError(`Sheet not found: ${title}`);
  return id;
}

/** Deep copy so callers cannot mutate the shared cache entry. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

export class SheetRepo {
  static async getRawValues(tabName: TableName): Promise<RawRow[]> {
    const sheets = await getSheetsApi();
    const spreadsheetId = getSpreadsheetId();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A:ZZ`,
    });
    return (res.data.values ?? []) as RawRow[];
  }

  static async find<T extends BaseRecord = AnyRecord>(tabName: TableName): Promise<T[]> {
    assertHasCommonColumns(tabName);

    const cached = cache.get(tabName);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return clone(cached.data) as unknown as T[];
    }

    const values = await this.getRawValues(tabName);
    if (values.length <= 1) return [];

    const headers = values[0];
    const data = values.slice(1).map((row) => {
      const obj: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        obj[h] = fromCell(h, row[i]);
      });
      return obj as unknown as AnyRecord;
    });

    cache.set(tabName, { data, timestamp: Date.now() });
    return clone(data) as unknown as T[];
  }

  static async findOne<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    id: string
  ): Promise<T | null> {
    const all = await this.find<T>(tabName);
    return all.find((r) => r.id === id) ?? null;
  }

  static async insert<T extends Record<string, CellValue>>(
    tabName: TableName,
    record: T,
    actorId: string = 'system'
  ): Promise<T & BaseRecord> {
    assertHasCommonColumns(tabName);

    // Generated OUTSIDE the retried closure: a retry after a partially applied
    // write must not append a second row carrying a different id.
    const newId = typeof record.id === 'string' && record.id ? record.id : crypto.randomUUID();
    const now = new Date().toISOString();

    const toInsert = {
      ...record,
      id: newId,
      created_at: now,
      updated_at: now,
      row_version: 1,
      created_by: actorId,
    } as T & BaseRecord;

    await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      // If a previous attempt already landed this row, stop rather than duplicate.
      const existing = await this.getRawValues(tabName);
      if (existing.slice(1).some((r) => r[0] === newId)) return;

      const headers = SCHEMAS[tabName] as readonly string[];
      const rowData = headers.map((h) => toCell((toInsert as Record<string, CellValue>)[h]));
      const auditLogData = buildAuditRow(actorId, tabName, newId, 'INSERT', null, toInsert, now);

      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { appendCells: { sheetId: mainSheetId, rows: [makeRowData(rowData)], fields: '*' } },
            { appendCells: { sheetId: auditSheetId, rows: [makeRowData(auditLogData)], fields: '*' } },
          ],
        },
      });
    });

    cache.delete(tabName);
    cache.delete('audit_log');
    return toInsert;
  }

  /**
   * Update one row under optimistic concurrency.
   *
   * `expectedVersion` is required. A missing or non-numeric value is a conflict,
   * never a pass -- callers must read the row, then write back the version they read.
   */
  static async update<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    id: string,
    record: Partial<Record<string, CellValue>>,
    expectedVersion: number,
    actorId: string = 'system'
  ): Promise<T> {
    assertHasCommonColumns(tabName);

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ConflictError(
        `row_version read beforehand is required to update (got: ${String(expectedVersion)})`
      );
    }

    const result = await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      const values = await this.getRawValues(tabName);
      if (values.length <= 1) throw new NotFoundError(`No rows in table ${tabName}`);

      const headers = values[0];
      const rowIndex = values.findIndex((r) => r[0] === id);
      if (rowIndex === -1) throw new NotFoundError(`No row with id ${id} in table ${tabName}`);

      const currentRow = values[rowIndex];
      const versionIdx = headers.indexOf('row_version');
      if (versionIdx === -1) {
        throw new Error(`Table ${tabName} has no row_version column`);
      }

      const currentVersion = Number.parseInt(currentRow[versionIdx], 10);
      if (Number.isNaN(currentVersion)) {
        throw new ConflictError(`Invalid row_version on this row (${currentRow[versionIdx]})`);
      }
      if (expectedVersion !== currentVersion) {
        throw new ConflictError(
          `Row changed by someone else (expected version ${expectedVersion}, now ${currentVersion})`
        );
      }

      const now = new Date().toISOString();
      const updated: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        if (h === 'row_version') updated[h] = currentVersion + 1;
        else if (h === 'updated_at') updated[h] = now;
        else if (h in record) updated[h] = record[h];
        else updated[h] = fromCell(h, currentRow[i]);
      });

      const rowData = headers.map((h) => toCell(updated[h]));

      const oldObj: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        oldObj[h] = fromCell(h, currentRow[i]);
      });

      const auditLogData = buildAuditRow(actorId, tabName, id, 'UPDATE', oldObj, updated, now);
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateCells: {
                // values[0] is the header and occupies grid row 0, so the index
                // into `values` maps one-to-one onto startRowIndex.
                range: {
                  sheetId: mainSheetId,
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                rows: [makeRowData(rowData)],
                fields: '*',
              },
            },
            { appendCells: { sheetId: auditSheetId, rows: [makeRowData(auditLogData)], fields: '*' } },
          ],
        },
      });

      return updated;
    });

    cache.delete(tabName);
    cache.delete('audit_log');
    return result as unknown as T;
  }

  /**
   * Remove a row for good, with the same optimistic-locking contract as
   * update(): the caller passes the row_version it read, and a row changed by
   * someone else in the meantime is refused rather than silently destroyed.
   *
   * The deleted row is written to audit_log first, so the record of what was
   * removed outlives the row itself.
   */
  static async delete(
    tabName: TableName,
    id: string,
    expectedVersion: number,
    actorId: string = 'system'
  ): Promise<void> {
    assertHasCommonColumns(tabName);

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw new ConflictError(
        `row_version read beforehand is required to delete (got: ${String(expectedVersion)})`
      );
    }

    await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      const values = await this.getRawValues(tabName);
      if (values.length <= 1) throw new NotFoundError(`No rows in table ${tabName}`);

      const headers = values[0];
      const rowIndex = values.findIndex((r) => r[0] === id);
      if (rowIndex === -1) throw new NotFoundError(`No row with id ${id} in table ${tabName}`);

      const currentRow = values[rowIndex];
      const versionIdx = headers.indexOf('row_version');
      if (versionIdx === -1) {
        throw new Error(`Table ${tabName} has no row_version column`);
      }

      const currentVersion = Number.parseInt(currentRow[versionIdx], 10);
      if (Number.isNaN(currentVersion)) {
        throw new ConflictError(`Invalid row_version on this row (${currentRow[versionIdx]})`);
      }
      if (expectedVersion !== currentVersion) {
        throw new ConflictError(
          `Row changed by someone else (expected version ${expectedVersion}, now ${currentVersion})`
        );
      }

      const oldObj: Record<string, CellValue> = {};
      headers.forEach((h, i) => {
        oldObj[h] = fromCell(h, currentRow[i]);
      });

      const now = new Date().toISOString();
      const auditLogData = buildAuditRow(actorId, tabName, id, 'DELETE', oldObj, {}, now);
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            { appendCells: { sheetId: auditSheetId, rows: [makeRowData(auditLogData)], fields: '*' } },
            {
              // values[0] is the header at grid row 0, so the index into
              // `values` is already the grid row index.
              deleteDimension: {
                range: {
                  sheetId: mainSheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });
    });

    cache.delete(tabName);
    cache.delete('audit_log');
  }

  /** Test seam: drop cached reads. */
  static clearCache(): void {
    cache.clear();
    sheetIdCache.clear();
  }
}
