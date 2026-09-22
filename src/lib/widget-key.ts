import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Keys for the phone widget (/api/widget).
 *
 * A widget cannot sign in with Google, so it carries a key instead. The key is
 * 32 random bytes -- nothing to guess or brute-force -- and only its SHA-256 is
 * stored. A slow password hash would buy nothing here: it exists to make weak,
 * human-chosen secrets expensive to try, and this one is neither.
 *
 * The prefix makes a pasted key recognisable for what it is.
 */
export const WIDGET_KEY_PREFIX = 'pmw_';

export function generateWidgetKey(): string {
  return WIDGET_KEY_PREFIX + randomBytes(32).toString('base64url');
}

export function hashWidgetKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Constant-time compare of two hex digests of equal, fixed length. */
export function widgetKeyMatches(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashWidgetKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/**
 * The key from a widget request.
 *
 * The Authorization header first -- Scriptable on iPhone sends one, and it
 * never reaches a log. `?key=` is accepted because KWGT on Android can only
 * fetch a bare URL; that key *does* land in Vercel's request log, which is why
 * Settings says so next to the Android link, and why revoking is one press.
 */
export function widgetKeyFrom(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }
  const fromQuery = new URL(request.url).searchParams.get('key')?.trim();
  return fromQuery || null;
}
