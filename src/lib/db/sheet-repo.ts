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

// Reads asked for in the same tick go out as ONE batchGet, and a tab already
// on its way is waited for rather than read twice.
//
// The dashboard asks for a dozen tabs at once and the layout and session
// around it ask for `users` again. Each used to be its own request: a dozen
// round trips on a cold server, and a dozen of the 60 reads a minute the
// service account is allowed -- across every page and every person.
const inflight = new Map<TableName, Promise<AnyRecord[]>>();
let queued: {
  tabName: TableName;
  generation: number;
  resolve: (rows: AnyRecord[]) => void;
  reject: (error: unknown) => void;
}[] = [];
let flushScheduled = false;

// Moved on by every write to a tab. A read that left before the write and
// lands after it still answers whoever asked, but must not refill the cache
// with the rows it saw.
const generation = new Map<TableName, number>();

function invalidate(tabName: TableName): void {
  cache.delete(tabName);
  inflight.delete(tabName);
  generation.set(tabName, (generation.get(tabName) ?? 0) + 1);
}

function isFresh(tabName: TableName): boolean {
  const hit = cache.get(tabName);
  return hit !== undefined && Date.now() - hit.timestamp < CACHE_TTL;
}

/** True when the stored version does not match what the caller expects. */
function expectedVersionMismatch(current: number, expected: number): boolean {
  return Number.isNaN(current) || expected !== current;
}

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

/**
 * Rows as written, header first, into records keyed by SCHEMAS.
 *
 * A column in SCHEMAS that the sheet does not have means code has been
 * deployed ahead of the migration. Say so, loudly. Reading the tab as empty
 * instead would show a page that has lost all its rows, with only a line in
 * the server log to explain it -- and the rows are all still there.
 */
function parseTab(tabName: TableName, rawRows: RawRow[]): AnyRecord[] {
  if (rawRows.length === 0) return [];

  const headers = rawRows[0];
  const expected = SCHEMAS[tabName] as readonly string[];
  const absent = expected.filter((h) => !headers.includes(h));
  if (absent.length > 0) {
    throw new Error(
      `Sheet is behind SCHEMAS: ${tabName} (no ${absent.join(', ')}). Run npm run db:migrate-schema.`
    );
  }

  return rawRows.slice(1).map((row) => {
    const obj: Record<string, CellValue> = {};
    expected.forEach((h) => {
      const idx = headers.indexOf(h);
      obj[h] = idx === -1 ? null : fromCell(h, row[idx]);
    });
    return obj as AnyRecord;
  });
}

function isBadRequest(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown };
  return e?.status === 400 || e?.code === 400;
}

/** One answer per tab, in order: its rows as written, or why it could not be read. */
async function fetchTabs(tabNames: TableName[]): Promise<PromiseSettledResult<RawRow[]>[]> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  const batchGet = async (names: TableName[]): Promise<RawRow[][]> => {
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: names.map((t) => `${t}!A:ZZ`),
    });
    const valueRanges = res.data.valueRanges ?? [];
    if (valueRanges.length !== names.length) {
      throw new Error(`batchGet answered ${valueRanges.length} ranges for ${names.length}`);
    }
    return valueRanges.map((vr) => (vr.values ?? []) as RawRow[]);
  };

  try {
    const all = await batchGet(tabNames);
    return all.map((value) => ({ status: 'fulfilled', value }));
  } catch (error) {
    // One range Sheets cannot parse -- a tab this sheet does not have -- fails
    // the whole batch. Ask again tab by tab, so only that read fails, as it did
    // when every tab was its own request. Anything else (quota, network) would
    // fail each of them the same way, so it is everyone's answer.
    if (tabNames.length === 1 || !isBadRequest(error)) {
      return tabNames.map(() => ({ status: 'rejected', reason: error }));
    }
    return Promise.all(
      tabNames.map(async (name): Promise<PromiseSettledResult<RawRow[]>> => {
        try {
          return { status: 'fulfilled', value: (await batchGet([name]))[0] };
        } catch (reason) {
          return { status: 'rejected', reason };
        }
      })
    );
  }
}

async function flush(): Promise<void> {
  flushScheduled = false;
  const batch = queued;
  queued = [];

  let results: PromiseSettledResult<RawRow[]>[];
  try {
    results = await fetchTabs(batch.map((q) => q.tabName));
  } catch (error) {
    // No client at all (missing credentials). Every waiter must still hear,
    // or the page awaiting it hangs instead of failing.
    batch.forEach((q) => q.reject(error));
    return;
  }

  batch.forEach((q, i) => {
    const result = results[i];
    if (result.status === 'rejected') {
      q.reject(result.reason);
      return;
    }
    try {
      // A tab behind SCHEMAS throws here and is not cached: an empty entry
      // would answer every read for the next minute with "there is nothing
      // here", and a sheet repaired in the meantime would not be picked up.
      const rows = parseTab(q.tabName, result.value);
      if ((generation.get(q.tabName) ?? 0) === q.generation) {
        cache.set(q.tabName, { data: rows, timestamp: Date.now() });
      }
      q.resolve(rows);
    } catch (error) {
      q.reject(error);
    }
  });
}

/** The tab's rows from the sheet, sharing a read already on its way or about to leave. */
function load(tabName: TableName): Promise<AnyRecord[]> {
  const pending = inflight.get(tabName);
  if (pending) return pending;

  const promise = new Promise<AnyRecord[]>((resolve, reject) => {
    queued.push({ tabName, generation: generation.get(tabName) ?? 0, resolve, reject });
  });
  inflight.set(tabName, promise);
  const forget = () => {
    if (inflight.get(tabName) === promise) inflight.delete(tabName);
  };
  promise.then(forget, forget);

  // A macrotask rather than a microtask, so reads started a few awaits apart
  // -- a page's Promise.all and whatever its first await resolves into --
  // still leave together. One that comes later joins the read in flight.
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(() => void flush(), 0);
  }
  return promise;
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

  /**
   * Fill the cache for several tabs in one request, for a page about to read
   * them. `find` already batches reads started together, so this is only
   * needed to read a tab ahead of the code that will ask for it.
   */
  static async preloadCache(tabNames: TableName[]): Promise<void> {
    const results = await Promise.allSettled(tabNames.filter((t) => !isFresh(t)).map(load));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }

  /**
   * `fresh` skips the read cache for this call, and refills it.
   *
   * For the one case where a stale read is indistinguishable from the truth:
   * a row that is not in the list. On a multi-instance deploy the process
   * serving a page may hold a list from before another process inserted the
   * row, so "missing" can mean "created seconds ago somewhere else" -- which
   * only a fresh read can answer. That includes a read already in flight: it
   * may have left before the row was written, so a fresh read sends its own.
   */
  static async find<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    options?: { fresh?: boolean }
  ): Promise<T[]> {
    assertHasCommonColumns(tabName);

    if (options?.fresh) {
      invalidate(tabName);
    } else if (isFresh(tabName)) {
      return clone(cache.get(tabName)!.data) as T[];
    }

    return clone(await load(tabName)) as T[];
  }

  static async findOne<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    id: string
  ): Promise<T | null> {
    const all = await this.find<T>(tabName);
    const hit = all.find((r) => r.id === id);
    if (hit) return hit;

    // Not in the cached list is not proof it does not exist -- see find().
    const fresh = await this.find<T>(tabName, { fresh: true });
    return fresh.find((r) => r.id === id) ?? null;
  }

  static async insert<T extends Record<string, CellValue>>(
    tabName: TableName,
    record: T,
    actorId: string = 'system',
    options?: {
      /**
       * Column-value pairs that must be unique. If a row already exists
       * matching ALL of these, the insert is skipped and the existing row
       * is returned. The check runs inside the write-queue mutex, so two
       * concurrent inserts with the same uniqueBy will not both succeed.
       *
       * ponytail: per-process mutex only — on multi-instance deploys a
       * narrow window remains; row_version is the last line of defence.
       */
      uniqueBy?: Record<string, CellValue>;
      /**
       * What a `uniqueBy` match does.
       *
       * `keep` -- the default -- leaves the existing row alone and returns it.
       * Right where the row IS the answer and a second attempt has nothing to
       * add: signing up with an address that already has an account must not
       * write anything, or registering again would overwrite somebody else's.
       *
       * `update` writes the new values onto the row it found, as update()
       * would. For a value somebody is editing -- a vote, minutes, a weekly
       * figure -- keeping the old row means the newer answer is dropped while
       * the screen says it was saved, so the caller has to say which it meant.
       */
      onConflict?: 'keep' | 'update';
    }
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

    let existingHit: (T & BaseRecord) | null = null;

    await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      // If a previous attempt already landed this row, stop rather than duplicate.
      const existing = await this.getRawValues(tabName);
      if (existing.slice(1).some((r) => r[0] === newId)) return;

      // Business-key dedup: if a row already matches all uniqueBy columns,
      // keep it or write onto it, as the caller asked.
      if (options?.uniqueBy && existing.length > 1) {
        const headers = existing[0];
        const entries = Object.entries(options.uniqueBy);
        const matchIndex = existing.findIndex(
          (row, i) =>
            i > 0 &&
            entries.every(([col, val]) => {
              const idx = headers.indexOf(col);
              return idx !== -1 && row[idx] === toCell(val);
            })
        );

        if (matchIndex !== -1) {
          const matched = existing[matchIndex];
          const old: Record<string, CellValue> = {};
          headers.forEach((h, i) => { old[h] = fromCell(h, matched[i]); });

          if (options.onConflict !== 'update') {
            existingHit = old as unknown as T & BaseRecord;
            return;
          }

          // The row keeps its id, its version moves on by one, and the change
          // reaches audit_log as the UPDATE it is -- the same contract as
          // update(), minus the expectedVersion the caller never read,
          // because the row it would have named is the one just found here.
          const versionIdx = headers.indexOf('row_version');
          const currentVersion = Number.parseInt(matched[versionIdx], 10);
          const merged: Record<string, CellValue> = {};
          headers.forEach((h, i) => {
            if (h === 'row_version') merged[h] = (Number.isNaN(currentVersion) ? 0 : currentVersion) + 1;
            else if (h === 'updated_at') merged[h] = now;
            else if (h in record) merged[h] = (record as Record<string, CellValue>)[h];
            else merged[h] = fromCell(h, matched[i]);
          });

          const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
          const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateCells: {
                    // values[0] is the header at grid row 0, so the index into
                    // the rows read above is already the grid row index.
                    range: {
                      sheetId: mainSheetId,
                      startRowIndex: matchIndex,
                      endRowIndex: matchIndex + 1,
                      startColumnIndex: 0,
                      endColumnIndex: headers.length,
                    },
                    rows: [makeRowData(headers.map((h) => toCell(merged[h])))],
                    fields: '*',
                  },
                },
                {
                  appendCells: {
                    sheetId: auditSheetId,
                    rows: [
                      makeRowData(
                        buildAuditRow(actorId, tabName, String(old.id), 'UPDATE', old, merged, now)
                      ),
                    ],
                    fields: '*',
                  },
                },
              ],
            },
          });

          existingHit = merged as unknown as T & BaseRecord;
          return;
        }
      }

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

    invalidate(tabName);
    invalidate('audit_log');
    return existingHit ?? toInsert;
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

    invalidate(tabName);
    invalidate('audit_log');
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

    invalidate(tabName);
    invalidate('audit_log');
  }

  /**
   * Delete multiple rows in one Sheets API call.
   *
   * All rows must belong to the same tab. Rows are deleted bottom-to-top so
   * grid indices stay valid. The whole batch is one batchUpdate request: either
   * all rows are removed or none are (Sheets API atomicity).
   */
  static async deleteMany(
    tabName: TableName,
    items: { id: string; expectedVersion: number }[],
    actorId: string = 'system'
  ): Promise<void> {
    if (items.length === 0) return;
    // Single item? Reuse the existing path — no extra code needed.
    if (items.length === 1) {
      return this.delete(tabName, items[0].id, items[0].expectedVersion, actorId);
    }
    assertHasCommonColumns(tabName);

    for (const item of items) {
      if (!Number.isInteger(item.expectedVersion) || item.expectedVersion < 1) {
        throw new ConflictError(
          `row_version required to delete ${item.id} (got: ${String(item.expectedVersion)})`
        );
      }
    }

    await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      const values = await this.getRawValues(tabName);
      if (values.length <= 1) throw new NotFoundError(`No rows in table ${tabName}`);

      const headers = values[0];
      const versionIdx = headers.indexOf('row_version');
      if (versionIdx === -1) throw new Error(`Table ${tabName} has no row_version column`);

      const now = new Date().toISOString();
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      // Collect row indices and validate versions
      const found: { rowIndex: number; id: string; auditData: string[] }[] = [];
      for (const item of items) {
        const rowIndex = values.findIndex((r) => r[0] === item.id);
        if (rowIndex === -1) continue; // Already deleted — skip silently

        const currentRow = values[rowIndex];
        const currentVersion = Number.parseInt(currentRow[versionIdx], 10);
        if (expectedVersionMismatch(currentVersion, item.expectedVersion)) {
          throw new ConflictError(
            `Row ${item.id} changed (expected ${item.expectedVersion}, now ${currentVersion})`
          );
        }

        const oldObj: Record<string, CellValue> = {};
        headers.forEach((h, i) => { oldObj[h] = fromCell(h, currentRow[i]); });
        found.push({
          rowIndex,
          id: item.id,
          auditData: buildAuditRow(actorId, tabName, item.id, 'DELETE', oldObj, {}, now),
        });
      }

      if (found.length === 0) return;

      // Sort descending by rowIndex so deletions don't shift indices
      found.sort((a, b) => b.rowIndex - a.rowIndex);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requests: any[] = found.map((f) => ({
        appendCells: { sheetId: auditSheetId, rows: [makeRowData(f.auditData)], fields: '*' },
      }));
      for (const f of found) {
        requests.push({
          deleteDimension: {
            range: {
              sheetId: mainSheetId,
              dimension: 'ROWS',
              startIndex: f.rowIndex,
              endIndex: f.rowIndex + 1,
            },
          },
        });
      }

      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    });

    invalidate(tabName);
    invalidate('audit_log');
  }

  /**
   * Update multiple rows in one Sheets API call.
   *
   * All rows must belong to the same tab. Each entry carries its own
   * expectedVersion for optimistic locking. The whole batch is atomic.
   */
  static async updateMany<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    items: { id: string; fields: Partial<Record<string, CellValue>>; expectedVersion: number }[],
    actorId: string = 'system'
  ): Promise<T[]> {
    if (items.length === 0) return [];
    if (items.length === 1) {
      const r = await this.update<T>(tabName, items[0].id, items[0].fields, items[0].expectedVersion, actorId);
      return [r];
    }
    assertHasCommonColumns(tabName);

    for (const item of items) {
      if (!Number.isInteger(item.expectedVersion) || item.expectedVersion < 1) {
        throw new ConflictError(
          `row_version required to update ${item.id} (got: ${String(item.expectedVersion)})`
        );
      }
    }

    const results = await writeQueue.enqueue(tabName, async () => {
      const sheets = await getSheetsApi();
      const spreadsheetId = getSpreadsheetId();

      const values = await this.getRawValues(tabName);
      if (values.length <= 1) throw new NotFoundError(`No rows in table ${tabName}`);

      const headers = values[0];
      const versionIdx = headers.indexOf('row_version');
      if (versionIdx === -1) throw new Error(`Table ${tabName} has no row_version column`);

      const now = new Date().toISOString();
      const mainSheetId = await getSheetId(sheets, spreadsheetId, tabName);
      const auditSheetId = await getSheetId(sheets, spreadsheetId, 'audit_log');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requests: any[] = [];
      const updatedRows: Record<string, CellValue>[] = [];

      for (const item of items) {
        const rowIndex = values.findIndex((r) => r[0] === item.id);
        if (rowIndex === -1) throw new NotFoundError(`No row with id ${item.id} in table ${tabName}`);

        const currentRow = values[rowIndex];
        const currentVersion = Number.parseInt(currentRow[versionIdx], 10);
        if (expectedVersionMismatch(currentVersion, item.expectedVersion)) {
          throw new ConflictError(
            `Row ${item.id} changed (expected ${item.expectedVersion}, now ${currentVersion})`
          );
        }

        const updated: Record<string, CellValue> = {};
        headers.forEach((h, i) => {
          if (h === 'row_version') updated[h] = currentVersion + 1;
          else if (h === 'updated_at') updated[h] = now;
          else if (h in item.fields) updated[h] = item.fields[h];
          else updated[h] = fromCell(h, currentRow[i]);
        });

        const rowData = headers.map((h) => toCell(updated[h]));

        const oldObj: Record<string, CellValue> = {};
        headers.forEach((h, i) => { oldObj[h] = fromCell(h, currentRow[i]); });

        requests.push({
          updateCells: {
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
        });
        requests.push({
          appendCells: {
            sheetId: auditSheetId,
            rows: [makeRowData(buildAuditRow(actorId, tabName, item.id, 'UPDATE', oldObj, updated, now))],
            fields: '*',
          },
        });

        updatedRows.push(updated);
      }

      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      return updatedRows;
    });

    invalidate(tabName);
    invalidate('audit_log');
    return results as unknown as T[];
  }

  /** Test seam: drop cached reads. */
  static clearCache(): void {
    cache.clear();
    sheetIdCache.clear();
    inflight.clear();
    generation.clear();
  }
}
