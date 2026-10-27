'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Coming back to the tab sooner than this after the last refresh does nothing. */
const MIN_GAP = 10_000;

/**
 * Keep a server-rendered page current without anybody pressing reload.
 *
 * Every `every` milliseconds while the tab is visible, and straight away when
 * the reader comes back to it, the page's server components are fetched again
 * (router.refresh), so somebody else's new booking or busy hour shows up on
 * its own. Client state -- the week on screen, a half-filled form -- is kept.
 *
 * It holds off while the reader is in the middle of something: a dialog open
 * or a field focused. Redrawing the calendar under a form somebody is typing
 * into, or a selection they are dragging, is worse than a minute's delay.
 * A hidden tab asks for nothing; each refresh asks Google for every connected
 * calendar, and a forgotten tab should not spend that.
 */
export default function AutoRefresh({ every }: { every: number }) {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    const busy = () =>
      document.querySelector('[aria-modal="true"]') !== null ||
      document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') === true;

    const refresh = () => {
      if (document.visibilityState !== 'visible' || busy()) return;
      last.current = Date.now();
      router.refresh();
    };
    // Switching back fires both visibilitychange and focus, and flicking
    // between tabs fires them again and again; one refresh covers all of it.
    const onReturn = () => {
      if (Date.now() - last.current >= MIN_GAP) refresh();
    };

    last.current = Date.now();
    const timer = window.setInterval(refresh, every);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [router, every]);

  return null;
}
