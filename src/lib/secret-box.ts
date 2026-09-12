import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for values that must sit in the spreadsheet.
 *
 * Google refresh tokens are long-lived and grant calendar access on behalf of a
 * person. The sheet is readable by everyone the sheet is shared with, so a
 * plaintext token there hands that person's calendar to every collaborator and
 * to anyone who later gets a copy of the file. Encrypting at rest means a leaked
 * sheet is not on its own enough.
 *
 * The key is derived from NEXTAUTH_SECRET, which already has to be secret and
 * already invalidates sessions when it changes. Rotating it also makes stored
 * tokens undecryptable -- callers treat that as "not connected" and ask the
 * person to reconnect, which is the correct outcome rather than an error.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const PREFIX = 'v1';

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set; refusing to store secrets unencrypted');
  }
  // A hash, not the raw secret: NEXTAUTH_SECRET has no fixed length.
  return createHash('sha256').update(`calendar-token:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join(':');
}

/**
 * Returns null for anything that does not decrypt: a value written under an
 * older key, a truncated cell, or something a person typed into the sheet by
 * hand. The caller shows "not connected" rather than failing the page.
 */
export function decryptSecret(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(`${PREFIX}:`)) return null;

  const parts = value.split(':');
  if (parts.length !== 4) return null;

  try {
    const [, ivB64, tagB64, bodyB64] = parts;
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = Buffer.concat([
      decipher.update(Buffer.from(bodyB64, 'base64')),
      decipher.final(),
    ]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

/** True when the value looks like something this module wrote. */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}
