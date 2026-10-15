'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/**
 * Short confirmations -- "saved", "deleted" -- that float at the bottom of the
 * screen and leave by themselves.
 *
 * Success only. An error stays on the page, beside whatever caused it: it has
 * to be read and acted on, and a message that walks away after three seconds
 * is the wrong place for that.
 *
 * The look is the tracker's original notice, which this replaces: a dark pill,
 * bottom centre, clear of a phone's home bar.
 */

const SHOW_MS = 3500;
/** Longer than the exit in globals.css, in case animationend never comes. */
const EXIT_FALLBACK_MS = 400;
/** A burst of saves should not build a tower; the oldest goes first. */
const MAX = 3;

type Toast = { id: number; text: string; leaving: boolean };

const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (text: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all, { id, text, leaving: false }].slice(-MAX));
      setTimeout(() => {
        setToasts((all) => all.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
        setTimeout(() => remove(id), EXIT_FALLBACK_MS);
      }, SHOW_MS);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-closing={toast.leaving || undefined}
            onAnimationEnd={(e) => {
              if (e.animationName === 'motion-shrink') remove(toast.id);
            }}
            className="toast-pill motion-dialog max-w-full px-4 py-2.5 rounded-xl text-sm bg-gray-900 text-white shadow-lg"
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
