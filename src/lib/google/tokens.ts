import { SheetRepo } from '@/lib/db/sheet-repo';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
import type { GoogleTokenRecord } from '@/lib/db/schema';
import { grantsCalendar, grantsDrive } from './scopes';
import { forgetClient } from './client-cache';

export { CALENDAR_SCOPES } from './scopes';

export type StoredToken = {
  id: string;
  userId: string;
  refreshToken: string;
  accountEmail: string;
  connectedAt: string;
  rowVersion: number;
  /**
   * Why this connection last failed, or empty while it is healthy.
   *
   * recordTokenError has always written this -- its comment says "so the UI can
   * say so" -- but nothing read it, so a revoked grant showed as plain "not
   * connected", which reads as "never set up" rather than "this broke".
   */
  lastError: string;
};

/** True when both halves of the OAuth client are configured. */
export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Save or replace a person's refresh token.
 *
 * Google only returns a refresh token on the first consent unless the flow asks
 * for it again, so an empty value here means "still connected, nothing new" and
 * must not wipe the stored one.
 */
export async function storeRefreshToken(input: {
  userId: string;
  refreshToken: string | null | undefined;
  scope: string;
  accountEmail: string;
}): Promise<void> {
  // A plain sign-in now asks for identity only, so it says nothing about the
  // calendar connection -- and must not speak for it. Without this guard a
  // sign-in would rewrite the stored scope to one with no calendar in it, and
  // a sign-in that happened to return a token would overwrite a working
  // connection with one that cannot read a calendar.
  //
  // Drive counts too: the press that connects the lab's Drive returns a token
  // worth keeping even though there is no calendar in it, and without this it
  // was silently dropped on the floor.
  if (!grantsCalendar(input.scope) && !grantsDrive(input.scope)) return;

  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  const existing = rows.find((r) => r.user_id === input.userId);
  const now = new Date().toISOString();

  if (!input.refreshToken) {
    if (existing) {
      await SheetRepo.update<GoogleTokenRecord>(
        'google_tokens',
        existing.id,
        { scope: input.scope, account_email: input.accountEmail, last_error: '' },
        existing.row_version,
        input.userId
      );
    }
    return;
  }

  const fields = {
    refresh_token: encryptSecret(input.refreshToken),
    scope: input.scope,
    account_email: input.accountEmail,
    connected_at: now,
    last_error: '',
  };

  // A new refresh token replaces whatever a cached client is holding, and may
  // belong to a different Google account than the one connected before. Drop
  // the client so the next call is made with the token just stored.
  forgetClient(input.userId);

  if (existing) {
    await SheetRepo.update<GoogleTokenRecord>(
      'google_tokens',
      existing.id,
      fields,
      existing.row_version,
      input.userId
    );
  } else {
    await SheetRepo.insert('google_tokens', { user_id: input.userId, ...fields }, input.userId);
  }
}

/**
 * The stored token for one person, or null when there is none or it cannot be
 * decrypted. An undecryptable row is treated as "not connected" rather than an
 * error: the fix is for the person to reconnect, not for the page to fail.
 */
export async function getStoredToken(userId: string): Promise<StoredToken | null> {
  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  const row = rows.find((r) => r.user_id === userId);
  if (!row) return null;

  const refreshToken = decryptSecret(row.refresh_token);
  if (!refreshToken) return null;

  return {
    id: row.id,
    userId: row.user_id,
    refreshToken,
    accountEmail: row.account_email ?? '',
    connectedAt: row.connected_at ?? '',
    rowVersion: row.row_version,
    lastError: row.last_error ?? '',
  };
}

/**
 * The stored token belonging to a particular *Google* account, whoever in the
 * app connected it.
 *
 * Files are stored on one nominated account -- the lab's -- and which app user
 * happened to press the button is not the point. `account_email` records which
 * Google account a token is for, so that is what this matches on.
 */
export async function tokenForGoogleAccount(email: string): Promise<StoredToken | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  const row = rows.find(
    (r) => (r.account_email ?? '').trim().toLowerCase() === wanted && grantsDrive(r.scope ?? '')
  );
  if (!row) return null;

  return getStoredToken(row.user_id);
}

/** Everyone with a usable connection, for free/busy across the group. */
export async function getConnectedUserIds(): Promise<Set<string>> {
  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  return new Set(
    rows.filter((r) => decryptSecret(r.refresh_token) !== null).map((r) => r.user_id)
  );
}

/** Record why a connection stopped working, so the UI can say so. */
export async function recordTokenError(userId: string, message: string): Promise<void> {
  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  const row = rows.find((r) => r.user_id === userId);
  if (!row) return;
  await SheetRepo.update<GoogleTokenRecord>(
    'google_tokens',
    row.id,
    { last_error: message.slice(0, 300) },
    row.row_version,
    userId
  );
}

export async function disconnect(userId: string): Promise<void> {
  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  const row = rows.find((r) => r.user_id === userId);
  if (!row) return;
  await SheetRepo.delete('google_tokens', row.id, row.row_version, userId);
  // Deleting the row is not enough on its own: a client built from this token
  // is cached in memory, and would go on reading the calendar of somebody who
  // has just disconnected until it aged out.
  forgetClient(userId);
}

/**
 * Connections that have stopped working, for an admin to chase.
 *
 * A grant can be revoked from the Google account side at any time -- somebody
 * removes the app from their third-party access, or changes their password --
 * and the app finds out only when a free/busy read fails. That failure is
 * swallowed on purpose so one broken calendar does not fail the whole grid,
 * which means nothing surfaces it unless somebody asks. This is the asking.
 */
export async function brokenConnections(): Promise<
  { userId: string; accountEmail: string; lastError: string }[]
> {
  const rows = await SheetRepo.find<GoogleTokenRecord>('google_tokens');
  return rows
    .filter((r) => (r.last_error ?? '') !== '')
    .map((r) => ({
      userId: r.user_id,
      accountEmail: r.account_email ?? '',
      lastError: r.last_error ?? '',
    }));
}
