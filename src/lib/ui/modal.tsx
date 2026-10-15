'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * What every dialog owes somebody using a keyboard.
 *
 * Each dialog used to decide this for itself, and most decided nothing: of
 * thirteen, five closed on Escape, focus stayed on the button that opened them
 * -- so Tab walked through the page behind the scrim -- and closing one left
 * focus on <body>, back at the top of the page. This is the one place that
 * now does all three:
 *
 *  - focus moves in on opening: to whatever an `autoFocus` already chose, else
 *    `[data-autofocus]`, else the first control;
 *  - Escape closes, and Tab cycles inside;
 *  - closing gives focus back to whatever had it before.
 *
 * Only the topmost open dialog answers, so a dialog opened from another one
 * closes by itself and leaves its parent open.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

/** Open dialogs, innermost last. Only the last one handles keys. */
const stack: object[] = [];

export function useModal(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  // Whatever had focus when this rendered first. An `autoFocus` inside the
  // dialog moves focus during the commit, before any effect could look, so the
  // opener has to be read here or it is gone.
  const [openerAtMount] = useState<Element | null>(() =>
    typeof document === 'undefined' ? null : document.activeElement,
  );
  // Latest onClose without re-running the effect -- callers pass a fresh
  // arrow every render, and re-running would steal focus back each time.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;

    const token = {};
    stack.push(token);

    const opener = root.contains(document.activeElement) ? openerAtMount : document.activeElement;
    if (!root.contains(document.activeElement)) {
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0];
      target?.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      // Only if focus is still ours to give back: a dialog that closes because
      // somebody clicked elsewhere must not drag focus away from there.
      const lost = !document.activeElement || document.activeElement === document.body || root.contains(document.activeElement);
      if (lost && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, ref, openerAtMount]);
}

/**
 * The same, for a dialog written inline inside <Presence>: wrap the scrim in
 * it. `display: contents`, so it adds nothing to the layout.
 */
export function ModalScope({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, true, onClose);
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
