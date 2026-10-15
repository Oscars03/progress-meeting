'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Longer than any exit in globals.css, so the fallback never cuts one short. */
const EXIT_FALLBACK_MS = 400;

/**
 * Keeps a dialog on screen long enough to animate out.
 *
 * `{open && <Dialog />}` unmounts the moment `open` turns false, so there is
 * nothing left to animate. Wrap it instead:
 *
 *   <Presence value={open}>{() => <Dialog />}</Presence>
 *
 * While `value` is truthy the children render with it. When it turns falsy
 * they keep rendering with the last value they were opened with, under a
 * `data-closing` wrapper that globals.css turns into an exit animation, and
 * unmount when the scrim's exit ends.
 *
 * The last value is captured on opening, not on every render: callers pass
 * fresh objects, and re-storing one each render would loop. For the 150ms of
 * an exit, the props a dialog was opened with are close enough.
 */
export function Presence<T>({
  value,
  children,
}: {
  value: T | null | undefined | false;
  children: (value: T) => ReactNode;
}) {
  const open = Boolean(value);
  const [wasOpen, setWasOpen] = useState(open);
  const [last, setLast] = useState<T | null>(open ? (value as T) : null);
  const [closing, setClosing] = useState(false);

  // Adjusting state while rendering, as React's docs describe for reacting to
  // a prop change -- an effect would paint one frame with the dialog gone.
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open);
    if (open) setLast(value as T);
  }

  // animationend is the real signal; this only covers a browser that never
  // fires it, so a closed dialog cannot linger invisible over the page.
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  const shown = open ? (value as T) : closing ? last : null;
  if (shown === null) return null;

  return (
    <div
      className="contents"
      data-closing={closing || undefined}
      onAnimationEnd={(e) => {
        if (closing && e.animationName === 'motion-exit') setClosing(false);
      }}
    >
      {children(shown)}
    </div>
  );
}
