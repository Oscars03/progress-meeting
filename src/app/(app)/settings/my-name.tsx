'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyNameAction } from './actions';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';

/**
 * Your own name, editable by you.
 *
 * This is the first card on Settings because it is the only thing on the page
 * that every member can act on -- everything below it is either admin-only or a
 * status readout. Admins can still edit anyone's name further down; this is the
 * same field, reached without having to ask somebody.
 */
export default function MyName({ name, email }: { name: string; email: string }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(name);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const unchanged = draft.trim() === name.trim();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await updateMyNameAction(draft);
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setMessage({ kind: 'ok', text: t('common.saved') });
      router.refresh();
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">{t('myName.title')}</h3>

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

      <form onSubmit={save} className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="my-name">
            {t('myName.label')}
          </label>
          <input
            id="my-name"
            type="text"
            required
            maxLength={60}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || unchanged}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition text-sm font-medium h-[34px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending && <Spinner className="h-4 w-4" />}
          {t('common.save')}
        </button>
      </form>

      {/* The account this name belongs to. It is not editable here -- changing
          it would change who you sign in as, not what you are called. */}
      <p className="text-xs text-gray-500">{email}</p>
    </div>
  );
}
