import { SheetRepo } from '@/lib/db/sheet-repo';
import { decryptSecret, encryptSecret } from '@/lib/secret-box';
import type { GoogleTokenRecord } from '@/lib/db/schema';

/**
 * Scopes asked for at sign-in.
 *
 * calendar.events is write access to events only -- it cannot create or delete
 * whole calendars, or read the person's settings. calendar.readonly is what
 * lets the app see busy times on their other calendars when suggesting a
 * meeting slot. Asking for plain `calendar` would cover both and more, which is
 * more than this app does.
 */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

export type StoredToken = {
  id: string;
  userId: string;
  refreshToken: string;
  accountEmail: string;
  connectedAt: string;
  rowVersion: number;
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
  };
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
}
