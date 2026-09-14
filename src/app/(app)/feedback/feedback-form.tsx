'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';
import { submitFeedbackAction } from './actions';
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH } from './categories';

export default function FeedbackForm() {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('problem');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const left = FEEDBACK_MAX_LENGTH - body.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await submitFeedbackAction({ body, category });
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setBody('');
      setMessage({ kind: 'ok', text: t('feedback.thanks') });
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4"
    >
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('feedback.writeTitle')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('feedback.writeHint')}</p>
      </div>

      {message && (
        <p
          className={`p-3 rounded-lg text-sm border ${
            message.kind === 'ok'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
          role="status"
        >
          {message.text}
        </p>
      )}

      {/* Radios rather than a select: three options are quicker to hit than to
          open, and on a phone a select is a modal wheel for no reason. */}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('feedback.category')}</legend>
        {FEEDBACK_CATEGORIES.map((value) => (
          <label
            key={value}
            className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition ${
              category === value
                ? 'bg-blue-600 border-blue-600 text-white font-medium'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="category"
              value={value}
              checked={category === value}
              onChange={() => setCategory(value)}
              className="sr-only"
            />
            {t(`feedback.category.${value}` as 'feedback.category.problem')}
          </label>
        ))}
      </fieldset>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={FEEDBACK_MAX_LENGTH}
          required
          placeholder={t('feedback.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
        />
        {/* Only near the limit: a counter on an empty box is noise. */}
        {left < 200 && (
          <p className="text-xs text-gray-500 mt-1 text-right tabular-nums">{left}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !body.trim()}
        className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending && <Spinner className="h-4 w-4" />}
        {t('feedback.send')}
      </button>
    </form>
  );
}
