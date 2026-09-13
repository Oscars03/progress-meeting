import type { TranslationKey, TranslationVars } from './ui/i18n';
import { UserError } from './user-error';

export type ActionFailure = { ok: false; error: TranslationKey; vars?: TranslationVars };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

/**
 * Run a server action body and report its outcome as a value.
 *
 * Expected failures are returned rather than thrown, as the Next.js error
 * handling guide recommends: a thrown message is redacted in production, and
 * the server does not know the reader's language anyway. Anything that is not
 * a UserError is a bug, so it is logged here and reported generically.
 */
export async function toResult<T extends object = object>(
  work: () => Promise<T | void>
): Promise<ActionResult<T>> {
  try {
    const value = await work();
    return { ok: true, ...(value ?? {}) } as { ok: true } & T;
  } catch (err) {
    if (err instanceof UserError) {
      return { ok: false, error: err.key, vars: err.vars };
    }
    console.error('server action failed:', err);
    return { ok: false, error: 'error.generic' };
  }
}
