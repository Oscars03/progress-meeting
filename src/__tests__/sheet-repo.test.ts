import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers, batchUpdateCalls, META_ROWS } from '../mocks/handlers';
import { SheetRepo, ConflictError, NotFoundError } from '../lib/db/sheet-repo';

const server = setupServer(...handlers);

process.env.SPREADSHEET_ID = 'test_spreadsheet_id';
process.env.SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test',
  client_email: 'test@test.iam.gserviceaccount.com',
});

vi.mock('googleapis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('googleapis')>();
  return {
    ...actual,
    google: {
      ...actual.google,
      auth: {
        GoogleAuth: class {
          async getClient() {
            return this;
          }
          async request(opts: { url: string; params?: Record<string, string>; method?: string; data?: unknown }) {
            let url = opts.url;
            if (opts.params) url += '?' + new URLSearchParams(opts.params).toString();
            const res = await fetch(url, {
              method: opts.method || 'GET',
              body: opts.data ? JSON.stringify(opts.data) : undefined,
            });
            const data = await res.json();
            // As gaxios does: a refused request throws, carrying its status.
            if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, code: res.status });
            return { data, status: res.status, headers: res.headers };
          }
        },
      },
    },
  };
});

beforeAll(() => server.listen());
beforeEach(() => {
  SheetRepo.clearCache();
  batchUpdateCalls.length = 0;
});
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe('SheetRepo.find', () => {
  it('parses rows into typed records', async () => {
    const results = await SheetRepo.find('meta');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
    expect(results[0].row_version).toBe(1);
    expect(results[0].key).toBe('test_key');
  });

  it('returns a copy so callers cannot corrupt the cache', async () => {
    const first = await SheetRepo.find('meta');
    (first[0] as Record<string, unknown>).key = 'MUTATED';

    const second = await SheetRepo.find('meta');
    expect(second[0].key).toBe('test_key');
  });

  /**
   * Code deployed ahead of the migration. Answering "there are no rows" would
   * show a page that has lost everything, when the rows are all still there --
   * so the missing column is named, and the tab is left uncached so a sheet
   * migrated in the meantime is picked up on the next read rather than a
   * minute later.
   */
  it('refuses a sheet missing a column SCHEMAS declares', async () => {
    const shortHeaders = [
      ['id', 'created_at', 'updated_at', 'row_version', 'created_by', 'key'],
      ['1', '2023-01-01', '2023-01-01', '1', 'system', 'test_key'],
    ];
    server.use(
      http.get('https://sheets.googleapis.com/v4/spreadsheets/:id/values:batchGet', () =>
        HttpResponse.json({ valueRanges: [{ values: shortHeaders }] })
      )
    );

    await expect(SheetRepo.find('meta')).rejects.toThrow(/no value.*db:migrate-schema/);

    server.resetHandlers();
    const recovered = await SheetRepo.find('meta');
    expect(recovered[0].value).toBe('test_value');
  });
});

/**
 * A page asks for many tabs at once. Each used to be its own request -- a round
 * trip apiece on a cold server, and one apiece of the service account's 60
 * reads a minute.
 */
describe('SheetRepo.find batching', () => {
  const WEEK_LEAD_ROWS = [
    ['id', 'created_at', 'updated_at', 'row_version', 'created_by', 'week_key', 'user_id'],
    ['w1', '2023-01-01', '2023-01-01', '1', 'system', '2026-W42', 'u1'],
  ];
  const ROWS: Record<string, string[][]> = { meta: META_ROWS, week_leads: WEEK_LEAD_ROWS };
  const BATCH_URL = 'https://sheets.googleapis.com/v4/spreadsheets/:id/values:batchGet';

  /** The tabs each batchGet asked for, one entry per request. */
  let requests: string[][];
  const rangesOf = (request: Request) =>
    new URL(request.url).searchParams
      .getAll('ranges')
      .flatMap((r) => r.split(','))
      .map((r) => r.replace('!A:ZZ', ''));

  beforeEach(() => {
    requests = [];
    server.use(
      http.get(BATCH_URL, ({ request }) => {
        const tabs = rangesOf(request);
        requests.push(tabs);
        if (tabs.some((t) => !(t in ROWS))) {
          return HttpResponse.json({ error: { code: 400, message: 'Unable to parse range' } }, { status: 400 });
        }
        return HttpResponse.json({ valueRanges: tabs.map((t) => ({ values: ROWS[t] })) });
      })
    );
  });

  it('reads tabs asked for together in one request', async () => {
    const [meta, leads] = await Promise.all([SheetRepo.find('meta'), SheetRepo.find('week_leads')]);

    expect(requests).toEqual([['meta', 'week_leads']]);
    expect(meta[0].key).toBe('test_key');
    expect(leads[0].week_key).toBe('2026-W42');
  });

  it('shares a read already on its way instead of sending another', async () => {
    const first = SheetRepo.find('meta');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = SheetRepo.find('meta');

    await Promise.all([first, second]);
    expect(requests).toEqual([['meta']]);
  });

  it('fails only the tab the sheet does not have', async () => {
    // 'users' is not in ROWS, so the batch containing it is refused as a whole.
    const [meta, users] = await Promise.allSettled([SheetRepo.find('meta'), SheetRepo.find('users')]);

    expect(meta.status).toBe('fulfilled');
    expect(users.status).toBe('rejected');
  });

  it('does not cache what a read saw when a write lands before it returns', async () => {
    const stale = SheetRepo.find('meta');
    // A write to the same tab while the read is still out.
    await SheetRepo.update('meta', '1', { value: 'updated' }, 1);
    await stale;

    requests = [];
    await SheetRepo.find('meta');
    expect(requests).toEqual([['meta']]);
  });
});

/**
 * The mock sheet holds one meta row: key "test_key", value "test_value",
 * row_version 1. Inserting against a uniqueBy of that key is the case where
 * the caller read the tab a moment ago and did not see the row.
 */
describe('SheetRepo.insert uniqueBy', () => {
  it('keeps the existing row by default, writing nothing', async () => {
    const result = await SheetRepo.insert(
      'meta',
      { key: 'test_key', value: 'second_value' },
      'someone',
      { uniqueBy: { key: 'test_key' } }
    );

    expect(result.id).toBe('1');
    expect(result.value).toBe('test_value');
    expect(result.row_version).toBe(1);
    expect(batchUpdateCalls).toHaveLength(0);
  });

  it('writes the new values onto the row it found when asked to update', async () => {
    const result = await SheetRepo.insert(
      'meta',
      { key: 'test_key', value: 'second_value' },
      'someone',
      { uniqueBy: { key: 'test_key' }, onConflict: 'update' }
    );

    // The row it found, moved on -- not a second row, and not the old value.
    expect(result.id).toBe('1');
    expect(result.value).toBe('second_value');
    expect(result.row_version).toBe(2);
    expect(result.created_at).toBe('2023-01-01');

    const requests = (batchUpdateCalls[0] as { requests: Record<string, unknown>[] }).requests;
    expect(requests[0]).toHaveProperty('updateCells');
    // The change is recorded as what it is, against the row that already existed.
    const audit = requests[1] as { appendCells: { rows: [{ values: { userEnteredValue: { stringValue: string } }[] }] } };
    const cells = audit.appendCells.rows[0].values.map((v) => v.userEnteredValue?.stringValue);
    expect(cells).toContain('UPDATE');
    expect(cells).toContain('1');
  });

  it('inserts normally when nothing matches', async () => {
    const result = await SheetRepo.insert(
      'meta',
      { key: 'brand_new', value: 'v' },
      'someone',
      { uniqueBy: { key: 'brand_new' }, onConflict: 'update' }
    );

    expect(result.row_version).toBe(1);
    const requests = (batchUpdateCalls[0] as { requests: Record<string, unknown>[] }).requests;
    expect(requests[0]).toHaveProperty('appendCells');
  });
});

describe('SheetRepo.update optimistic concurrency', () => {
  it('rejects a stale row_version', async () => {
    await expect(SheetRepo.update('meta', '1', { key: 'new_val' }, 99)).rejects.toThrow(
      ConflictError
    );
  });

  it('rejects a missing or zero version instead of skipping the check', async () => {
    await expect(
      SheetRepo.update('meta', '1', { key: 'x' }, undefined as unknown as number)
    ).rejects.toThrow(ConflictError);
    await expect(SheetRepo.update('meta', '1', { key: 'x' }, 0)).rejects.toThrow(ConflictError);
  });

  it('accepts the matching version and writes the row', async () => {
    const updated = await SheetRepo.update('meta', '1', { value: 'updated' }, 1);
    expect(updated.row_version).toBe(2);
    expect(batchUpdateCalls).toHaveLength(1);
  });

  it('reports a missing id as NotFound', async () => {
    await expect(SheetRepo.update('meta', 'nope', { key: 'x' }, 1)).rejects.toThrow(NotFoundError);
  });
});
