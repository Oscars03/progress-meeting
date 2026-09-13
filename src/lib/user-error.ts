import type { TranslationKey, TranslationVars } from './ui/i18n';

/**
 * An error the person using the app should read, carried as a message key.
 *
 * The server cannot pick the words: it does not render the message, and in
 * production Next.js replaces a thrown error's text before it reaches the
 * browser. So actions catch these and return the key (see action-result.ts),
 * and the page translates it into the reader's language.
 *
 * `detail` is for logs and tests only -- it is never shown.
 */
export class UserError extends Error {
  readonly key: TranslationKey;
  readonly vars?: TranslationVars;

  constructor(key: TranslationKey, vars?: TranslationVars, detail?: string) {
    super(detail ?? (key as string));
    this.name = 'UserError';
    this.key = key;
    this.vars = vars;
  }
}
