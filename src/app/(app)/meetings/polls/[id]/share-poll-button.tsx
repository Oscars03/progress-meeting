'use client';

import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';

/**
 * Copies a short message with the poll's link, ready for the lab's group chat.
 *
 * The link is the poll page itself, not a public one: whoever opens it signs
 * in with their own account, so a vote is still somebody's vote and the tally
 * is counted as it always was. Signing in comes back to this poll -- see
 * lib/return-path.ts.
 *
 * The origin is read in the browser, so a copy made on the live site carries
 * the live address and one made on localhost carries localhost.
 */
export default function SharePollButton({ pollId, title }: { pollId: string; title: string }) {
  const { t } = usePrefs();
  const toast = useToast();

  const copy = async () => {
    const url = `${window.location.origin}/meetings/polls/${pollId}`;
    try {
      await navigator.clipboard.writeText(t('polls.shareText', { title, url }));
      toast(t('polls.shareCopied'));
    } catch {
      // No clipboard (an insecure origin, a refused permission): the link
      // itself is still worth having, so it is shown to be copied by hand.
      toast(t('polls.shareFailed', { url }));
    }
  };

  return (
    <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
      </svg>
      {t('polls.share')}
    </button>
  );
}
