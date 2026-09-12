import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../lib/secret-box';

const ORIGINAL = process.env.NEXTAUTH_SECRET;

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-secret-box';
});

afterEach(() => {
  process.env.NEXTAUTH_SECRET = ORIGINAL;
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', () => {
    const token = '1//0abcdefghijklmnop-refresh-token';
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('never emits the plaintext', () => {
    const token = 'super-secret-value';
    expect(encryptSecret(token)).not.toContain(token);
  });

  it('produces a different ciphertext each time', () => {
    const a = encryptSecret('same input');
    const b = encryptSecret('same input');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('handles unicode', () => {
    const value = 'โทเคนภาษาไทย ✓';
    expect(decryptSecret(encryptSecret(value))).toBe(value);
  });

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    const good = encryptSecret('token');
    const [v, iv, tag, body] = good.split(':');
    const flipped = Buffer.from(body, 'base64');
    flipped[0] ^= 0xff;
    const tampered = [v, iv, tag, flipped.toString('base64')].join(':');
    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null when the key has changed', () => {
    const value = encryptSecret('token');
    process.env.NEXTAUTH_SECRET = 'a-different-secret';
    expect(decryptSecret(value)).toBeNull();
  });

  it('returns null for values it did not write', () => {
    expect(decryptSecret('')).toBeNull();
    expect(decryptSecret('plain text someone typed')).toBeNull();
    expect(decryptSecret('v1:only:three')).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
    expect(decryptSecret(42)).toBeNull();
  });

  it('throws rather than storing in the clear when the secret is missing', () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => encryptSecret('token')).toThrow(/NEXTAUTH_SECRET/);
  });
});

describe('isEncrypted', () => {
  it('recognises its own output', () => {
    expect(isEncrypted(encryptSecret('x'))).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isEncrypted('1//0-looks-like-a-token')).toBe(false);
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });
});
