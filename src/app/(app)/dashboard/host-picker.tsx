'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMeetingHost } from '../meetings/actions';
import { usePrefs } from '@/lib/ui/prefs';

export type RotationStudent = { id: string; name: string };

/**
 * Confirms who runs a meeting.
 *
 * The select starts on whoever is already confirmed, or on the rotation's
 * suggestion when nobody is -- so the common case is one press, and choosing
 * someone else is the same control rather than a second mode.
 */
export default function HostPicker({
  meetingId,
  rowVersion,
  students,
  hostId,
  suggestedId,
}: {
  meetingId: string;
  rowVersion: number;
  students: RotationStudent[];
  hostId: string;
  suggestedId: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(hostId || suggestedId);

  const confirmed = Boolean(hostId);
  const unchanged = choice === hostId;

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setMeetingHost(meetingId, choice, rowVersion);
        if (res.ok) router.refresh();
        else setError(t(res.error, res.vars));
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={isPending}
          aria-label={t('rotation.title')}
          className="flex-1 min-w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={save}
          disabled={isPending || (confirmed && unchanged)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 whitespace-nowrap"
        >
          {confirmed ? t('common.save') : t('rotation.confirm')}
        </button>
      </div>
    </div>
  );
}
