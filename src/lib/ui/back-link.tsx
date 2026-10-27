'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePrefs } from './prefs';

/**
 * How we know whether there is a page of *this app* to go back to.
 *
 * document.referrer cannot answer it: a Link navigation never reloads the
 * document, so the referrer stays whatever it was when the tab first arrived.
 * Counting history entries cannot either: going back does not shorten
 * history, so landing on the poll list, opening a poll and coming back left a
 * longer history behind the list than when it was first opened -- and its
 * back link then stepped out of the app, to wherever the tab had been before.
 *
 * So NavTrail keeps the pages walked through, as a stack. Arriving at the
 * page just below the top is a step back and pops; anything else pushes.
 * Forward buttons and links that happen to retrace a step make it approximate,
 * and approximate only ever errs towards following the link's own href.
 */
const TRAIL_KEY = 'wpm.trail';
const TRAIL_MAX = 50;

function readTrail(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Mounted once in the app layout. */
export function NavTrail() {
  const pathname = usePathname();

  useEffect(() => {
    const trail = readTrail();
    if (trail.at(-2) === pathname) trail.pop();
    else if (trail.at(-1) !== pathname) trail.push(pathname);
    try {
      sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail.slice(-TRAIL_MAX)));
    } catch {
      // Private windows and blocked storage: the link falls back to its href.
    }
  }, [pathname]);

  return null;
}

function cameFromInsideTheApp(): boolean {
  const trail = readTrail();
  // A tab opened from a link can inherit the trail of the tab it came from
  // while having no history of its own, hence the second test.
  return trail.length > 1 && trail.at(-1) === window.location.pathname && window.history.length > 1;
}

/**
 * "Back" that returns where you actually came from.
 *
 * A meeting can be reached from the calendar, the dashboard, or a poll, so a
 * fixed href sends two of those three somewhere they were not. That is also
 * why it says only "back": a label naming the calendar was wrong whenever the
 * page had been opened from somewhere else. Opened from a bookmark, a pasted
 * link or a new tab there is nothing to step back to, and `href` is followed
 * as written -- the link is never a dead end.
 *
 * It looks the same on every page: a quiet button above the page title.
 */
export default function BackLink({ href }: { /** Where to go when there is no in-app page behind this one. */ href: string }) {
  const router = useRouter();
  const { t } = usePrefs();

  return (
    <Link
      href={href}
      // The negative margin lines the arrow up with the title beneath it.
      className="tap btn btn-ghost btn-sm -ml-3"
      onClick={(event) => {
        // A modified click is the reader asking for a new tab or window; going
        // back in this one would be the opposite of what they pressed.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!cameFromInsideTheApp()) return;

        event.preventDefault();
        router.back();
      }}
    >
      <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {t('common.back')}
    </Link>
  );
}
