import type { TranslationKey, TranslationVars } from './ui/i18n';
import { UserError } from './user-error';
import { logError, logEvent } from './app-log';
import { requestContext } from './request-context';

export type ActionFailure = { ok: false; error: TranslationKey; vars?: TranslationVars };
export type ActionResult<T extends object = object> = ({ ok: true } & T) | ActionFailure;

/**
 * Run a server action body and report its outcome as a value.
 *
 * Expected failures are returned rather than thrown, as the Next.js error
 * handling guide recommends: a thrown message is redacted in production, and
 * the server does not know the reader's language anyway. Anything that is not
 * a UserError is a bug, so it is logged here and reported generically.
 *
 * Both kinds reach the app log (lib/app-log.ts). Catching them here means
 * Next never sees them, so its own error hook does not -- this is the only
 * place that can say an action went wrong.
 */
export async function toResult<T extends object = object>(
  work: () => Promise<T | void>
): Promise<ActionResult<T>> {
  try {
    const value = await work();
    return { ok: true, ...(value ?? {}) } as { ok: true } & T;
  } catch (err) {
    const { userId, path } = await requestContext();

    if (err instanceof UserError) {
      // Not printed: the app meant to say no. Kept, because "it would not let
      // me" is a report that starts here.
      logEvent({
        level: 'warn',
        event: 'action_refused',
        message: err.key as string,
        userId,
        path,
        detail: {
          ...(err.vars ? { vars: err.vars } : {}),
          ...(err.message !== err.key ? { reason: err.message } : {}),
        },
      });
      return { ok: false, error: err.key, vars: err.vars };
    }
    logError('action_failed', err, { message: 'server action failed', userId, path });
    return { ok: false, error: 'error.generic' };
  }
}
