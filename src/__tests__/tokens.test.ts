/**
 * The store of people's Google refresh tokens.
 *
 * What is tested here is the part that is easy to get wrong twice: calendar.ts
 * keeps a client built from a stored token, so removing or replacing that token
 * has to drop the client as well. Deleting the row alone left the app reading
 * the calendar of somebody who had just disconnected, for as long as the cached
 * client lived.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
}));

const cache = vi.hoisted(() => ({ forgetClient: vi.fn() }));

vi.mock('@/lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: repo.find,
    update: repo.update,
    insert: repo.insert,
    delete: repo.remove,
  },
}));

vi.mock('../lib/google/client-cache', () => ({ forgetClient: cache.forgetClient }));

vi.mock('@/lib/secret-box', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => (s.startsWith('enc:') ? s.slice(4) : null),
}));

const { disconnect, storeRefreshToken } = await import('../lib/google/tokens');

const ROW = {
  id: 'tok1',
  user_id: 'u1',
  refresh_token: 'enc:old-token',
  scope: 'https://www.googleapis.com/auth/calendar',
  account_email: 'old@example.com',
  connected_at: '2026-01-01T00:00:00Z',
  row_version: 3,
  last_error: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.find.mockResolvedValue([ROW]);
});

describe('disconnect', () => {
  it('forgets the cached client as well as deleting the row', async () => {
    await disconnect('u1');

    expect(repo.remove).toHaveBeenCalledWith('google_tokens', 'tok1', 3, 'u1');
    expect(cache.forgetClient).toHaveBeenCalledWith('u1');
  });

  it('does nothing for somebody who was never connected', async () => {
    repo.find.mockResolvedValue([]);

    await disconnect('nobody');

    expect(repo.remove).not.toHaveBeenCalled();
  });
});

describe('storeRefreshToken', () => {
  const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

  it('forgets the cached client when a new token is stored', async () => {
    // Reconnecting can hand back a token for an entirely different Google
    // account, so a client built from the old one must not survive it.
    await storeRefreshToken({
      userId: 'u1',
      refreshToken: 'new-token',
      scope: SCOPE,
      accountEmail: 'new@example.com',
    });

    expect(cache.forgetClient).toHaveBeenCalledWith('u1');
    expect(repo.update).toHaveBeenCalled();
  });

  it('leaves the connection alone when no new token comes back', async () => {
    // An empty refresh token means "still connected, nothing new" -- the
    // cached client still matches the stored one, so it is kept.
    await storeRefreshToken({
      userId: 'u1',
      refreshToken: null,
      scope: SCOPE,
      accountEmail: 'old@example.com',
    });

    expect(cache.forgetClient).not.toHaveBeenCalled();
  });

  it('ignores a scope that does not cover the calendar', async () => {
    await storeRefreshToken({
      userId: 'u1',
      refreshToken: 'new-token',
      scope: 'openid email',
      accountEmail: 'old@example.com',
    });

    expect(repo.update).not.toHaveBeenCalled();
    expect(cache.forgetClient).not.toHaveBeenCalled();
  });
});
