'use client';

import { usePrefs } from './prefs';
import { useToast } from './toast';
import type { TranslationKey, TranslationVars } from './i18n';

/**
 * Copies a short message with a link to a page of the app, for the lab's
 * group chat. Used by a poll and by the presentation order.
 *
 * The link is the page itself, not a public one: whoever opens it signs in
 * with their own account, so what they do there is still theirs. Signing in
 * comes back to the page -- see lib/return-path.ts.
 *
 * `message` is a translation key whose text holds `{url}`; it is translated
 * here, so the copy follows the language the page is being read in. The
 * origin is read in the browser, so a copy made on the live site carries the
 * live address and one made on localhost carries localhost.
 */
export default function CopyLinkButton({
  path,
  label,
  message,
  vars,
}: {
  path: string;
  label: TranslationKey;
  message: TranslationKey;
  vars?: TranslationVars;
}) {
  const { t } = usePrefs();
  const toast = useToast();

  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(t(message, { ...vars, url }));
      toast(t('common.linkCopied'));
    } catch {
      // No clipboard (an insecure origin, a refused permission): the link
      // itself is still worth having, so it is shown to be copied by hand.
      toast(t('common.linkCopyFailed', { url }));
    }
  };

  return (
    <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </svg>
      {t(label)}
    </button>
  );
}
