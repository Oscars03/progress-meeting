'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMinutesAction } from './actions';
import { usePrefs } from '@/lib/ui/prefs';

export default function MinutesEditor({
  meetingId,
  initialContent,
  minutesId,
  rowVersion,
}: {
  meetingId: string;
  initialContent: string;
  minutesId: string | null;
  rowVersion: number | null;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const dirty = content !== initialContent;

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await saveMinutesAction(meetingId, content, minutesId, rowVersion);
        if (!res.ok) {
          setMessage({ type: 'error', text: t(res.error, res.vars) });
          return;
        }
        setMessage({ type: 'ok', text: t('common.saved') });
        router.refresh();
      } catch {
        setMessage({ type: 'error', text: t('error.generic') });
      }
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('minutes.title')}</h3>
        {dirty && !isPending && (
          <span className="text-xs text-amber-700">{t('minutes.unsaved')}</span>
        )}
      </div>

      {message && (
        <div
          role="status"
          className={`p-2.5 text-sm rounded-lg border ${
            message.type === 'ok'
              ? 'text-green-800 bg-green-50 border-green-200'
              : 'text-red-800 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        placeholder={t('minutes.placeholder')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={isPending || !dirty}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {isPending ? t('common.saving') : t('common.save')}
        </button>
        <p className="text-xs text-gray-500">{t('minutes.oneRecord')}</p>
      </div>
    </section>
  );
}
