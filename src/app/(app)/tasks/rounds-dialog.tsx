'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { MAX_ROUND_NAME } from '@/lib/tracker';
import { saveRounds } from './round-actions';
import type { TrackerRound } from './tracker-model';
import { CloseIcon } from './tracker-ui';

type Draft = { key: string; id?: string; name: string; due: string; rowVersion?: number };

/**
 * Add, rename, re-date and remove submission rounds, and save them together.
 *
 * One save for the whole list rather than one per row, because that is how
 * the change is thought about -- "term two moves to March and there is a
 * third round now" -- and one refresh afterwards shows all of it.
 */
export default function RoundsDialog({
  rounds,
  countIn,
  onClose,
  onSaved,
}: {
  rounds: TrackerRound[];
  countIn: (roundId: string) => number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    rounds.map((r) => ({ key: r.id, id: r.id, name: r.name, due: r.due, rowVersion: r.rowVersion }))
  );
  const [removed, setRemoved] = useState<TrackerRound[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const made = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // After "add", put the cursor in the new round's name.
  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[type="text"]');
    inputs?.[inputs.length - 1]?.focus();
  });

  const edit = (key: string, patch: Partial<Draft>) => {
    setError(null);
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const add = () => {
    made.current += 1;
    const key = `new-${made.current}`;
    focusLast.current = true;
    setDrafts((ds) => [...ds, { key, name: t('tracker.rounds.newName', { n: ds.length + 1 }), due: '' }]);
  };

  const remove = (d: Draft) => {
    setDrafts((ds) => ds.filter((x) => x.key !== d.key));
    const original = rounds.find((r) => r.id === d.id);
    if (original) setRemoved((rs) => [...rs, original]);
  };

  const save = () => {
    if (drafts.some((d) => !d.name.trim())) {
      setError(t('tasks.roundNameRequired'));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveRounds({
          rounds: drafts.map((d) => ({ id: d.id, name: d.name, due_date: d.due, rowVersion: d.rowVersion })),
          removed: removed.map((r) => ({ id: r.id, rowVersion: r.rowVersion })),
        });
        if (!res.ok) {
          setError(t(res.error, res.vars));
          return;
        }
        router.refresh();
        onSaved(res.moved > 0 ? t('tracker.rounds.savedMoved', { n: res.moved }) : t('tracker.rounds.saved'));
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  const field = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trk-rounds-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 sm:p-6 overflow-y-auto max-h-[92dvh]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="trk-rounds-title" className="text-lg font-semibold text-gray-900">
              {t('tracker.rounds.title')}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('tracker.rounds.intro')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label={t('weekly.close')}
          >
            <CloseIcon />
          </button>
        </div>

        <div ref={listRef} className="mt-4 flex flex-col gap-2">
          {drafts.length > 0 && (
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_10rem_6.5rem] gap-2 text-xs text-gray-500">
              <span>{t('tracker.rounds.name')}</span>
              <span>{t('tasks.due')}</span>
              <span />
            </div>
          )}
          {drafts.length === 0 && <p className="text-sm text-gray-500">{t('tracker.rounds.empty')}</p>}
          {drafts.map((d) => (
            <div
              key={d.key}
              className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_10rem_6.5rem] gap-2 items-center pb-2 border-b border-gray-100 sm:pb-0 sm:border-0"
            >
              <input
                type="text"
                value={d.name}
                maxLength={MAX_ROUND_NAME}
                onChange={(e) => edit(d.key, { name: e.target.value })}
                aria-label={t('tracker.rounds.name')}
                className={field}
              />
              <input
                type="date"
                value={d.due}
                onChange={(e) => edit(d.key, { due: e.target.value })}
                aria-label={t('tracker.rounds.dueOf', { name: d.name })}
                className={field}
              />
              <span className="col-span-2 sm:col-span-1 flex items-center justify-between gap-1 text-xs text-gray-500">
                <span>{d.id ? t('tracker.count', { n: countIn(d.id) }) : t('tracker.rounds.isNew')}</span>
                <button
                  type="button"
                  onClick={() => remove(d)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-800 hover:bg-red-50"
                  aria-label={t('tracker.rounds.remove', { name: d.name })}
                >
                  <CloseIcon />
                </button>
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="mt-3 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          {t('tracker.rounds.add')}
        </button>
        <p className="text-xs text-gray-500 mt-3">{t('tracker.rounds.hint')}</p>

        {error && (
          <div role="alert" className="mt-3 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? t('common.saving') : t('tracker.rounds.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
