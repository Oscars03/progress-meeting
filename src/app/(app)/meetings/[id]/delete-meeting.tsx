'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMeeting } from '../actions';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';

/**
 * Removing a meeting.
 *
 * There was no way to do this anywhere in the app: deleting the poll a meeting
 * came from left the meeting behind, still on the dashboard and still holding
 * the time in everyone's availability.
 *
 * Two presses rather than a browser confirm(), which a phone renders as a bare
 * system box with none of this text in it -- and this is the one action here
 * that cannot be undone.
 */
export default function DeleteMeeting({
  meetingId,
  rowVersion,
}: {
  meetingId: string;
  rowVersion: number;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');

  const remove = () => {
    setError('');
    startTransition(async () => {
      const res = await deleteMeeting(meetingId, rowVersion);
      if (!res.ok) {
        setError(t(res.error, res.vars));
        setArmed(false);
        return;
      }
      router.push('/meetings');
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="p-3 text-sm bg-red-50 text-red-800 border border-red-200 rounded-lg" role="alert">
          {error}
        </p>
      )}

      {armed ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700">{t('meeting.deleteConfirm')}</span>
          <button
            type="button"
            onClick={remove}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60"
          >
            {isPending && <Spinner className="h-4 w-4" />}
            {t('meeting.deleteYes')}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={isPending}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="text-sm text-red-600 hover:underline"
        >
          {t('meeting.delete')}
        </button>
      )}
    </div>
  );
}
