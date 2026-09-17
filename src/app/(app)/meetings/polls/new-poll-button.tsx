'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPollAction } from './actions';
import { usePrefs } from '@/lib/ui/prefs';

type SlotDraft = { start: string; end: string };

const EMPTY: SlotDraft = { start: '', end: '' };

/**
 * `defaultOpen` lets the dashboard's "create a poll" button land on the form
 * rather than on a page holding another button to press. Read once as the
 * initial state, so closing it does not have to fight the URL.
 */
export default function NewPollButton({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(defaultOpen);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<SlotDraft[]>([{ ...EMPTY }, { ...EMPTY }]);

  const setSlot = (index: number, patch: Partial<SlotDraft>) => {
    setSlots(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  /**
   * Filling a start time without an end is the common case, so the end
   * defaults to an hour later rather than making the user type it twice.
   */
  const onStartChange = (index: number, start: string) => {
    const slot = slots[index];
    if (!slot.end && start) {
      const end = new Date(Date.parse(start) + 60 * 60 * 1000);
      if (!Number.isNaN(end.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        const value = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(
          end.getDate()
        )}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
        setSlot(index, { start, end: value });
        return;
      }
    }
    setSlot(index, { start });
  };

  const submit = () => {
    setError('');
    const filled = slots.filter((s) => s.start && s.end);
    if (!title.trim()) {
      setError(t('polls.error.titleRequired'));
      return;
    }
    if (filled.length === 0) {
      setError(t('polls.error.minSlots'));
      return;
    }

    startTransition(async () => {
      try {
        const result = await createPollAction({ title, note, slots: filled });
        if (!result.ok) throw new Error(t(result.error as Parameters<typeof t>[0]));
        setOpen(false);
        setTitle('');
        setNote('');
        setSlots([{ ...EMPTY }, { ...EMPTY }]);
        router.push(`/meetings/polls/${result.pollId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('polls.error.createFailed'));
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 whitespace-nowrap"
      >
        {t('polls.newPoll')}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto bg-black/40">
      <div className="w-full max-w-lg my-8 p-4 sm:p-6 bg-white rounded-xl shadow-lg border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('polls.createTitle')}</h3>

        {error && (
          <div
            role="status"
            className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200"
          >
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="poll-title">
            {t('polls.title')}
          </label>
          <input
            id="poll-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('polls.titlePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="poll-note">
            {t('polls.notes')}
          </label>
          <input
            id="poll-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('polls.notesPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-medium text-gray-600">{t('polls.proposedTimes')}</span>
          {slots.map((slot, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={slot.start}
                onChange={(e) => onStartChange(index, e.target.value)}
                aria-label={t('polls.startOf', { n: index + 1 })}
                className="flex-1 min-w-40 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <span className="text-xs text-gray-400">{t('polls.to')}</span>
              <input
                type="datetime-local"
                value={slot.end}
                onChange={(e) => setSlot(index, { end: e.target.value })}
                aria-label={t('polls.endOf', { n: index + 1 })}
                className="flex-1 min-w-40 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              {slots.length > 1 && (
                <button
                  onClick={() => setSlots(slots.filter((_, i) => i !== index))}
                  aria-label={t('polls.removeSlot', { n: index + 1 })}
                  className="px-2 py-1 text-xs text-red-600 hover:underline"
                >
                  {t('polls.remove')}
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setSlots([...slots, { ...EMPTY }])}
            className="text-sm text-blue-600 hover:underline"
          >
            {t('polls.addSlot')}
          </button>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            onClick={submit}
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {isPending ? t('polls.creating') : t('polls.create')}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              setError('');
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
