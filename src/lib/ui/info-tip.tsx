'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { usePrefs } from './prefs';

/** Space kept between the bubble and the edge of the screen. */
const GUTTER = 16;
const WIDTH = 288;

/**
 * An ⓘ that holds an explanation instead of printing it.
 *
 * Most cards and pages carried a grey sentence saying what they were for --
 * read once, then skipped over every visit after, and in the way of what
 * mattered. The sentence now sits behind this, next to the heading it
 * explains. Things a person needs at the moment they act -- a warning, a rule
 * a field must meet -- stay in the open; this is for "what is this".
 *
 * A tap or a click opens it and keeps it open; a mouse resting on it opens it
 * until the mouse leaves. Escape, a tap anywhere else, or scrolling closes it.
 *
 * The bubble is fixed to the viewport and placed by measuring the icon, so it
 * is never clipped by a card's overflow, and moves above the icon when there
 * is no room below.
 */
export default function InfoTip({ children }: { children: React.ReactNode }) {
  const { t } = usePrefs();
  const id = useId();
  const [open, setOpen] = useState<'hover' | 'pinned' | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Placed straight onto the element, not through state: it depends on a
  // measurement, and setting state from a layout effect renders twice.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const bubble = bubbleRef.current;
    if (!open || !button || !bubble) return;
    const icon = button.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - GUTTER * 2);
    bubble.style.width = `${width}px`;
    const left = Math.min(
      Math.max(icon.left + icon.width / 2 - width / 2, GUTTER),
      window.innerWidth - width - GUTTER
    );
    const below = icon.bottom + 6;
    const fitsBelow = below + bubble.offsetHeight + GUTTER <= window.innerHeight;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${fitsBelow ? below : Math.max(GUTTER, icon.top - 6 - bubble.offsetHeight)}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !bubbleRef.current?.contains(target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('common.moreInfo')}
        aria-expanded={open !== null}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => (o === 'pinned' ? null : 'pinned'))}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setOpen((o) => o ?? 'hover');
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setOpen((o) => (o === 'hover' ? null : o));
        }}
        // Sized as the icon, so it sits in a line of text without pushing it
        // apart; the ::after reaches out to a finger-sized target instead.
        className="tap-exempt relative inline-flex shrink-0 items-center justify-center align-middle rounded-full text-gray-400 hover:text-gray-700 after:absolute after:-inset-3 after:content-['']"
      >
        <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5" />
          <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          className="fixed z-[80] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-700 shadow-lg"
        >
          {children}
        </div>
      )}
    </>
  );
}
