import bcrypt from 'bcryptjs';
import { UserError } from './user-error';

const SALT_ROUNDS = 10;

/** bcrypt hashes always start with $2a$ / $2b$ / $2y$ followed by the cost. */
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isHashed(value: unknown): value is string {
  return typeof value === 'string' && BCRYPT_RE.test(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored value.
 *
 * Returns false for anything that is not a bcrypt hash. Legacy plaintext rows
 * therefore fail closed rather than being compared directly -- run
 * `npm run db:migrate-passwords` to upgrade them.
 */
export async function verifyPassword(plain: string, stored: unknown): Promise<boolean> {
  if (!isHashed(stored)) return false;
  return bcrypt.compare(plain, stored);
}

/** Minimum policy applied wherever a password is set. */
export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(plain: string): UserError | null {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return new UserError('error.passwordTooShort', { n: MIN_PASSWORD_LENGTH });
  }
  return null;
}
