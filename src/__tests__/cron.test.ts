/**
 * The cron endpoint, and what it will hand out.
 *
 * It is reachable from the public internet, so the first thing worth proving is
 * that it says nothing at all without the secret -- and that a wrong secret is
 * refused the same way a missing one is. After that: `open_feedback` returns
 * the open rows and only those, with the `row_version` whoever acts on them
 * will need, and without anybody's email address.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const tables: Record<string, unknown[]> = {};

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => tables[table] ?? [],
  },
}));

const { GET } = await import('../app/api/cron/route');

const SECRET = 'a-secret-of-some-length';

function get(url: string, token?: string) {
  return GET(
    new Request(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  );
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;

  tables.feedback = [
    {
      id: 'f-1',
      body: 'the dark mode button is invisible',
      category: 'problem',
      status: 'open',
      created_at: '2026-09-02T00:00:00.000Z',
      created_by: 'u-1',
      row_version: 3,
    },
    {
      id: 'f-2',
      body: 'already handled',
      category: 'idea',
      status: 'done',
      created_at: '2026-09-03T00:00:00.000Z',
      created_by: 'u-1',
      row_version: 5,
    },
    {
      id: 'f-3',
      body: 'let the list sort itself',
      category: 'idea',
      status: 'open',
      created_at: '2026-09-01T00:00:00.000Z',
      created_by: 'u-missing',
      row_version: 1,
    },
  ];
  tables.users = [{ id: 'u-1', name: 'Ploy', email: 'ploy@example.com' }];
});

describe('the cron endpoint', () => {
  it('refuses a request with no token', async () => {
    expect((await get('https://x/api/cron?action=open_feedback')).status).toBe(401);
  });

  it('refuses a wrong token, including one of a different length', async () => {
    expect((await get('https://x/api/cron?action=open_feedback', 'nope')).status).toBe(401);
    expect(
      (await get('https://x/api/cron?action=open_feedback', 'a-secret-of-some-lengtH')).status
    ).toBe(401);
  });

  it('refuses everything when no secret is configured', async () => {
    delete process.env.CRON_SECRET;
    expect((await get('https://x/api/cron?action=open_feedback', SECRET)).status).toBe(401);
  });

  it('names open_feedback among the valid actions', async () => {
    const res = await get('https://x/api/cron', SECRET);
    expect(res.status).toBe(400);
    expect((await res.json()).valid).toContain('open_feedback');
  });

  it('still reports the planned jobs as unbuilt', async () => {
    expect((await get('https://x/api/cron?action=backup', SECRET)).status).toBe(501);
  });
});

describe('open_feedback', () => {
  it('returns the open rows, oldest first, and leaves the done ones out', async () => {
    const body = await (await get('https://x/api/cron?action=open_feedback', SECRET)).json();

    expect(body.count).toBe(2);
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['f-3', 'f-1']);
  });

  it('carries the row_version and the author name, and no email', async () => {
    const body = await (await get('https://x/api/cron?action=open_feedback', SECRET)).json();
    const item = body.items.find((i: { id: string }) => i.id === 'f-1');

    expect(item.row_version).toBe(3);
    expect(item.author).toBe('Ploy');
    expect(JSON.stringify(body)).not.toContain('@example.com');
  });

  it('does not drop a row whose author is gone', async () => {
    const body = await (await get('https://x/api/cron?action=open_feedback', SECRET)).json();
    const item = body.items.find((i: { id: string }) => i.id === 'f-3');

    expect(item.author).toBe('unknown');
  });
});
