'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMinutesAction } from './actions';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';

export default function MinutesEditor({
  meetingId,
  initialContent,
  minutesId,
  rowVersion,
  canEdit,
}: {
  meetingId: string;
  initialContent: string;
  minutesId: string | null;
  rowVersion: number | null;
  /**
   * Whoever runs this meeting's week, or an admin. There is one minutes row
   * per meeting and a save replaces it, so an editable box for everybody was
   * an invitation to overwrite the agreed account of a meeting you did not
   * run. Reading stays open to all.
   */
  canEdit: boolean;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== initialContent;

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveMinutesAction(meetingId, content, minutesId, rowVersion);
        if (!res.ok) {
          setError(t(res.error, res.vars));
          return;
        }
        toast(t('common.saved'));
        router.refresh();
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id="minutes-title" className="text-lg font-semibold text-gray-900">{t('minutes.title')}</h3>
        {dirty && !isPending && (
          <span className="text-xs text-amber-700">{t('minutes.unsaved')}</span>
        )}
      </div>

      {error && (
        <div role="alert" className="p-2.5 text-sm rounded-lg border text-red-800 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      {canEdit ? (
        <>
          <textarea
            aria-labelledby="minutes-title"
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
        </>
      ) : content ? (
        /* whitespace-pre-line: the minutes are typed in paragraphs, and a
           collapsed record reads as one run-on sentence. */
        <p className="text-sm text-gray-900 whitespace-pre-line break-words">{content}</p>
      ) : (
        /* Not a congratulation: nothing has been written, which is different
           from the meeting having nothing to record -- see CLAUDE.md. */
        <p className="text-sm text-gray-500">{t('minutes.noneYet')}</p>
      )}
    </section>
  );
}
