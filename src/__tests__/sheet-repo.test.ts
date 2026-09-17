import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers, batchUpdateCalls } from '../mocks/handlers';
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
            return { data: await res.json(), status: res.status, headers: res.headers };
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
