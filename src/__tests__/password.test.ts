import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, isHashed, validatePassword } from '../lib/password';

describe('password hashing', () => {
  it('produces a bcrypt hash that verifies', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(isHashed(hash)).toBe(true);
    expect(hash).not.toContain('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('fails closed on anything that is not a bcrypt hash', async () => {
    await expect(verifyPassword('plaintext', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', null)).resolves.toBe(false);
    await expect(verifyPassword('x', undefined)).resolves.toBe(false);
  });

  it('enforces a minimum length', () => {
    expect(validatePassword('short')).not.toBeNull();
    expect(validatePassword('longenough123')).toBeNull();
  });
});
