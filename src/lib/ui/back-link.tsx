'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * How we know whether there is a page of *this app* to go back to.
 *
 * document.referrer cannot answer it: a Link navigation never reloads the
 * document, so the referrer stays whatever it was when the tab first arrived --
 * which is exactly the case we need to detect. Instead, NavDepth records how
 * long the tab's history was when the app was first opened; anything longer
 * than that is a step we took ourselves.
 */
const DEPTH_KEY = 'wpm.entryDepth';

/** Mounted once in the app layout, on whichever page the visitor lands first. */
export function NavDepth() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DEPTH_KEY) === null) {
        sessionStorage.setItem(DEPTH_KEY, String(window.history.length));
      }
    } catch {
      // Private windows and blocked storage: the link falls back to its href.
    }
  }, [pathname]);

  return null;
}

function cameFromInsideTheApp(): boolean {
  try {
    const entry = Number(sessionStorage.getItem(DEPTH_KEY));
    return Number.isFinite(entry) && entry > 0 && window.history.length > entry;
  } catch {
    return false;
  }
}

/**
 * "Back" that returns where you actually came from.
 *
 * A meeting can be reached from the calendar, the dashboard, or a poll, so a
 * fixed href sends two of those three somewhere they were not. Opened from a
 * bookmark, a pasted link or a new tab there is nothing to step back to, and
 * `href` is followed as written -- the link is never a dead end.
 */
export default function BackLink({
  href,
  className,
  children,
}: {
  /** Where to go when there is no in-app page behind this one. */
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        // A modified click is the reader asking for a new tab or window; going
        // back in this one would be the opposite of what they pressed.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!cameFromInsideTheApp()) return;

        event.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
