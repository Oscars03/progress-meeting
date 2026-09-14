import { getSheetsApi, getSpreadsheetId } from './sheet-client';
import { SCHEMAS, type TableName } from './schema';
import { SheetRepo } from './sheet-repo';

/**
 * Bump whenever SCHEMAS changes. Stored in the `meta` tab so a sheet can say
 * which shape it is on, rather than being inferred every time.
 */
export const SCHEMA_VERSION = 10;

const VERSION_KEY = 'schema_version';

export type MigrationPlan = {
  createTabs: TableName[];
  addColumns: { tab: TableName; columns: string[] }[];
  conflicts: { tab: TableName; position: number; found: string; expected: string }[];
};

export type MigrationResult = MigrationPlan & {
  applied: boolean;
  fromVersion: number | null;
  toVersion: number;
};

function expected(tab: TableName): string[] {
  return [...(SCHEMAS[tab] as readonly string[])];
}

/**
 * Compare every tab's header row against SCHEMAS.
 *
 * Appending columns to the right of the existing ones is safe: the data rows
 * keep their positions. Anything else -- a renamed or reordered column -- would
 * silently shift values out from under their headers, so it is reported as a
 * conflict and nothing is written. This is the safe counterpart to db:init,
 * which rewrites header rows wholesale and now refuses to run on a populated
 * sheet for exactly that reason.
 */
export async function planMigration(): Promise<MigrationPlan> {
  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();
  const tabs = Object.keys(SCHEMAS) as TableName[];

  const info = await sheets.spreadsheets.get({ spreadsheetId });
  const present = new Set(
    (info.data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[]
  );

  const createTabs = tabs.filter((t) => !present.has(t));
  const existing = tabs.filter((t) => present.has(t));

  const plan: MigrationPlan = { createTabs, addColumns: [], conflicts: [] };
  if (existing.length === 0) return plan;

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: existing.map((t) => `${t}!1:1`),
  });

  (res.data.valueRanges ?? []).forEach((vr, i) => {
    const tab = existing[i];
    const found = (vr.values?.[0] ?? []).map((c) => String(c ?? '').trim());
    const want = expected(tab);

    for (let c = 0; c < Math.min(found.length, want.length); c++) {
      if (found[c] !== want[c]) {
        plan.conflicts.push({ tab, position: c, found: found[c], expected: want[c] });
      }
    }

    if (found.length < want.length) {
      plan.addColumns.push({ tab, columns: want.slice(found.length) });
    }
  });

  return plan;
}

async function readVersion(): Promise<number | null> {
  try {
    const rows = await SheetRepo.getRawValues('meta');
    if (rows.length <= 1) return null;
    const headers = rows[0];
    const keyIdx = headers.indexOf('key');
    const valIdx = headers.indexOf('value');
    if (keyIdx === -1 || valIdx === -1) return null;
    const row = rows.slice(1).find((r) => r[keyIdx] === VERSION_KEY);
    if (!row) return null;
    const n = Number.parseInt(row[valIdx], 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

async function writeVersion(version: number, actorId: string): Promise<void> {
  const rows = await SheetRepo.getRawValues('meta');
  const headers = rows[0] ?? [];
  const keyIdx = headers.indexOf('key');
  const existing =
    keyIdx === -1
      ? undefined
      : rows.slice(1).find((r) => r[keyIdx] === VERSION_KEY);

  if (existing) {
    const versionIdx = headers.indexOf('row_version');
    const current = Number.parseInt(existing[versionIdx], 10) || 1;
    await SheetRepo.update('meta', existing[0], { value: String(version) }, current, actorId);
    return;
  }

  await SheetRepo.insert('meta', { key: VERSION_KEY, value: String(version) }, actorId);
}

/**
 * Apply the additive part of the plan. Refuses outright when a conflict exists:
 * a sheet whose columns have been reordered by hand needs a person to look at
 * it, not a script that guesses.
 */
export async function migrateSchema(
  actorId: string = 'migration'
): Promise<MigrationResult> {
  const plan = await planMigration();
  const fromVersion = await readVersion();

  if (plan.conflicts.length > 0) {
    const first = plan.conflicts[0];
    throw new Error(
      `Header row does not match the schema: table "${first.tab}" column ${first.position + 1} ` +
        `is "${first.found}" but should be "${first.expected}" ` +
        `(${plan.conflicts.length} mismatch(es) in total). Fix the sheet by hand first; nothing was written.`
    );
  }

  const nothingToDo = plan.createTabs.length === 0 && plan.addColumns.length === 0;
  if (nothingToDo && fromVersion === SCHEMA_VERSION) {
    return { ...plan, applied: false, fromVersion, toVersion: SCHEMA_VERSION };
  }

  const sheets = await getSheetsApi();
  const spreadsheetId = getSpreadsheetId();

  if (plan.createTabs.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: plan.createTabs.map((tab) => ({
          addSheet: { properties: { title: tab } },
        })),
      },
    });

    // A brand new tab needs its full header row; there is no data to shift.
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: plan.createTabs.map((tab) => ({
          range: `${tab}!1:1`,
          values: [expected(tab)],
        })),
      },
    });
  }

  if (plan.addColumns.length > 0) {
    const info = await sheets.spreadsheets.get({ spreadsheetId });
    const byTitle = new Map(
      (info.data.sheets ?? []).map((s) => [s.properties?.title, s.properties] as const)
    );

    // Widen the grid first: writing past the last column of a narrow sheet fails.
    const widen = plan.addColumns
      .map(({ tab }) => {
        const props = byTitle.get(tab);
        const sheetId = props?.sheetId;
        const gridCols = props?.gridProperties?.columnCount ?? 0;
        const needed = expected(tab).length;
        if (sheetId === undefined || sheetId === null || gridCols >= needed) return null;
        return {
          appendDimension: {
            sheetId,
            dimension: 'COLUMNS',
            length: needed - gridCols,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (widen.length > 0) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: widen } });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: plan.addColumns.map(({ tab, columns }) => {
          const all = expected(tab);
          const startIdx = all.length - columns.length;
          return {
            range: `${tab}!${columnLetter(startIdx)}1`,
            values: [columns],
          };
        }),
      },
    });
  }

  SheetRepo.clearCache();
  await writeVersion(SCHEMA_VERSION, actorId);
  SheetRepo.clearCache();

  return { ...plan, applied: true, fromVersion, toVersion: SCHEMA_VERSION };
}

/** 0 -> A, 25 -> Z, 26 -> AA. Sheets ranges are addressed by letter. */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
