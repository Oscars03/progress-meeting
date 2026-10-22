'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { usePrefs } from './prefs';
import { Presence } from './presence';
import { ModalScope } from './modal';

/**
 * "Are you sure?", asked on the page.
 *
 * The browser's own confirm() was used for this in thirteen places. It is a
 * box the page does not draw: Chrome titles it with the site's address, a
 * phone renders it as a bare system sheet, it ignores the theme and the font,
 * and it says "OK" in whatever language the browser is in. The lab read it as
 * Chrome talking rather than the app.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm(t('topics.confirmDelete'), { danger: true }))) return;
 *
 * Resolves true for the confirm button, false for cancel, Escape or a press on
 * the scrim. One question at a time: asking again while one is open answers
 * the first with false.
 */

export type ConfirmOptions = {
  /** Shown as the dialog's heading; the message alone when absent. */
  title?: string;
  /** The confirm button's text. "Delete" for danger, "Confirm" otherwise. */
  confirmLabel?: string;
  /** Destructive: a red confirm button, and focus starts on cancel. */
  danger?: boolean;
};

type Ask = (message: string, options?: ConfirmOptions) => Promise<boolean>;

type Question = { message: string; options: ConfirmOptions; resolve: (ok: boolean) => void };

const ConfirmContext = createContext<Ask>(async () => false);

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [question, setQuestion] = useState<Question | null>(null);
  // The question waiting for an answer, outside state so asking and answering
  // never resolve one twice.
  const pending = useRef<Question | null>(null);

  const ask = useCallback<Ask>(
    (message, options = {}) =>
      new Promise<boolean>((resolve) => {
        pending.current?.resolve(false);
        const next = { message, options, resolve };
        pending.current = next;
        setQuestion(next);
      }),
    []
  );

  const answer = (ok: boolean) => {
    pending.current?.resolve(ok);
    pending.current = null;
    setQuestion(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Presence value={question}>
        {(q) => <ConfirmDialog question={q} onAnswer={answer} />}
      </Presence>
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ question, onAnswer }: { question: Question; onAnswer: (ok: boolean) => void }) {
  const { t } = usePrefs();
  const { message, options } = question;
  const label = options.confirmLabel ?? (options.danger ? t('common.delete') : t('common.confirm'));

  return (
    <ModalScope onClose={() => onAnswer(false)}>
      <div
        className="motion-scrim fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onAnswer(false);
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={options.title ? 'confirm-title' : 'confirm-message'}
          aria-describedby={options.title ? 'confirm-message' : undefined}
          className="motion-dialog w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        >
          {options.title && (
            <h3 id="confirm-title" className="mb-2 text-lg font-semibold text-gray-900">
              {options.title}
            </h3>
          )}
          <p id="confirm-message" className="whitespace-pre-line text-sm text-gray-700">
            {message}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onAnswer(false)}
              data-autofocus={options.danger ? '' : undefined}
              className="btn btn-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onAnswer(true)}
              data-autofocus={options.danger ? undefined : ''}
              className={`btn ${options.danger ? 'btn-danger' : 'btn-primary'}`}
            >
              {label}
            </button>
          </div>
        </div>
      </div>
    </ModalScope>
  );
}
