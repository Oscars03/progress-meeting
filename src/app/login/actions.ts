'use server';

import { SheetRepo } from '@/lib/db/sheet-repo';
import { hashPassword, validatePassword } from '@/lib/password';
import { isSignupAllowed, looksLikeEmail, normalizeEmail } from '@/lib/signup-policy';
import type { UserRecord } from '@/lib/db/schema';
import type { ActionFailure } from '@/lib/action-result';
import type { TranslationKey } from '@/lib/ui/i18n';

/**
 * Notice returned whenever a sign-up is accepted for review.
 *
 * The same notice comes back for an address that is already registered. An
 * attacker who could tell the two apart would have a way to test which
 * addresses hold accounts, and this action answers to anyone on the internet.
 */
const PENDING: TranslationKey = 'register.pending';

export type RegisterResult = { ok: true; notice: TranslationKey } | ActionFailure;

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
    return { ok: false, error: 'error.nameRequired' };
  }
  if (!looksLikeEmail(email)) {
    return { ok: false, error: 'error.emailInvalid' };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, error: passwordError.key, vars: passwordError.vars };
  }

  if (!isSignupAllowed(email)) {
    return { ok: false, error: 'register.domainNotAllowed' };
  }

  try {
    const users = await SheetRepo.find<UserRecord>('users');
    if (users.some((u) => normalizeEmail(u.email) === email)) {
      // Deliberately indistinguishable from success -- see PENDING.
      return { ok: true, notice: PENDING };
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
      'self-signup',
      // keep, never update: an address that already has an account belongs to
      // whoever holds it, and registering again must not write over their
      // password or their approval.
      { uniqueBy: { email }, onConflict: 'keep' }
    );

    return { ok: true, notice: PENDING };
  } catch (e) {
    console.error('registerAction failed:', e);
    return { ok: false, error: 'register.failed' };
  }
}
