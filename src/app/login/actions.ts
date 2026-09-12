'use server';

import { SheetRepo } from '@/lib/db/sheet-repo';
import { hashPassword, validatePassword } from '@/lib/password';
import { isSignupAllowed, looksLikeEmail, normalizeEmail } from '@/lib/signup-policy';
import type { UserRecord } from '@/lib/db/schema';

/**
 * Message returned whenever a sign-up is accepted for review.
 *
 * The same text comes back for an address that is already registered. An
 * attacker who could tell the two apart would have a way to test which
 * addresses hold accounts, and this action answers to anyone on the internet.
 */
const PENDING_MESSAGE =
  'ส่งคำขอสมัครแล้ว บัญชีจะใช้งานได้เมื่อผู้ดูแลระบบอนุมัติ';

export type RegisterResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Self-registration for accounts that do not use Google.
 *
 * Unauthenticated by design, so every constraint is enforced here rather than
 * in the form: the domain allowlist, the password policy, and -- most
 * importantly -- the account being created inactive. Nobody reaches the app
 * through this path without an admin turning them on.
 */
export async function registerAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<RegisterResult> {
  const name = (input.name ?? '').trim();
  const email = normalizeEmail(input.email);
  const password = input.password ?? '';

  if (!name) {
    return { ok: false, message: 'กรุณากรอกชื่อ' };
  }
  if (!looksLikeEmail(email)) {
    return { ok: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, message: passwordError };
  }

  if (!isSignupAllowed(email)) {
    return {
      ok: false,
      message: 'อีเมลนี้ไม่อยู่ในโดเมนที่เปิดให้สมัคร กรุณาติดต่อผู้ดูแลระบบ',
    };
  }

  try {
    const users = await SheetRepo.find<UserRecord>('users');
    if (users.some((u) => normalizeEmail(u.email) === email)) {
      // Deliberately indistinguishable from success -- see PENDING_MESSAGE.
      return { ok: true, message: PENDING_MESSAGE };
    }

    await SheetRepo.insert(
      'users',
      {
        name,
        email,
        password_hash: await hashPassword(password),
        role: 'member',
        team_id: '',
        line_id: '',
        active: false,
      },
      'self-signup'
    );

    return { ok: true, message: PENDING_MESSAGE };
  } catch (e) {
    console.error('registerAction failed:', e);
    return { ok: false, message: 'สมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }
}
