'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { setUserActiveAction } from '../settings/actions';
import Spinner from '@/lib/ui/spinner';

export type PendingUser = { id: string; name: string; email: string; row_version: number };

/**
 * People who signed up and cannot get in until an admin says so.
 *
 * Self-registration lands inactive by design, which means somebody is waiting
 * on a screen nobody opens -- Settings. Approving is one press from the page
 * an admin actually lands on; everything else about the account still lives in
 * Settings.
 */
export default function PendingUsers({ users }: { users: PendingUser[] }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const approve = (user: PendingUser) => {
    setError('');
    setBusyId(user.id);
    startTransition(async () => {
      try {
        await setUserActiveAction(user.id, true, user.row_version);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : t('error.generic'));
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <ul className="space-y-2">
      {error && (
        <li className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200" role="alert">
          {error}
        </li>
      )}

      {users.map((user) => (
        <li
          key={user.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 bg-white rounded-lg border border-gray-200"
        >
          <span className="flex-1 min-w-40">
            <span className="block font-medium text-gray-900">{user.name}</span>
            <span className="block text-xs text-gray-500 truncate">{user.email}</span>
          </span>

          <button
            type="button"
            onClick={() => approve(user)}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyId === user.id && <Spinner className="h-3.5 w-3.5" />}
            {busyId === user.id ? t('pending.approving') : t('pending.approve')}
          </button>
        </li>
      ))}
    </ul>
  );
}
