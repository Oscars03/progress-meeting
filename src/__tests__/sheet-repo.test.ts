import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { SheetRepo, ConflictError } from '../lib/db/sheet-repo';

const server = setupServer(...handlers);

// Set up env vars for tests
process.env.SPREADSHEET_ID = 'test_spreadsheet_id';
process.env.SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test',
  client_email: 'test@test.iam.gserviceaccount.com'
});

vi.mock('googleapis', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    google: {
      ...actual.google,
      auth: {
        GoogleAuth: class {
          async getClient() { return this; }
          async request(opts: any) {
            // Replace params in URL
            let url = opts.url;
            if (opts.params) {
              const qs = new URLSearchParams(opts.params).toString();
              url += '?' + qs;
            }
            const res = await fetch(url, { 
              method: opts.method || 'GET', 
              body: opts.data ? JSON.stringify(opts.data) : undefined 
            });
            return { data: await res.json(), status: res.status, headers: res.headers };
          }
        }
      }
    }
  };
});

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

describe('SheetRepo', () => {
  it('should find records and parse them correctly', async () => {
    const results = await SheetRepo.find('meta');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
    expect(results[0].row_version).toBe(1);
    expect(results[0].key).toBe('test_key');
  });

  it('should check optimistic concurrency on update', async () => {
    // Attempt to update with wrong row_version (current is 1)
    await expect(SheetRepo.update('meta', '1', { key: 'new_val', row_version: 99 }))
      .rejects.toThrow(ConflictError);
  });
});
