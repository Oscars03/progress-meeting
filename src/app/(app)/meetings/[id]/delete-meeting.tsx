'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMeeting } from '../actions';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
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
  const toast = useToast();
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
      // The toast outlives the page: its provider sits in the app layout.
      toast(t('meeting.deleted'));
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
            className="btn btn-danger btn-sm"
          >
            {isPending && <Spinner className="h-4 w-4" />}
            {t('meeting.deleteYes')}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={isPending}
            className="btn btn-secondary btn-sm"
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
