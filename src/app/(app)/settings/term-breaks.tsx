'use client';

import { useState, useTransition } from 'react';
import { usePrefs } from '@/lib/ui/prefs';
import { addTermBreakAction, deleteTermBreakAction } from './actions';
import type { TermBreakRecord } from '@/lib/db/schema';
import Spinner from '@/lib/ui/spinner';

export default function TermBreaks({ breaks }: { breaks: TermBreakRecord[] }) {
  const { t } = usePrefs();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const addBreak = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await addTermBreakAction(name, start, end);
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setName('');
      setStart('');
      setEnd('');
      setMessage({ kind: 'ok', text: t('common.saved') });
    });
  };

  const removeBreak = (id: string, rowVersion: number) => {
    if (!confirm(t('common.confirmDelete'))) return;
    setMessage(null);
    startTransition(async () => {
      const res = await deleteTermBreakAction(id, rowVersion);
      setMessage(
        res.ok
          ? { kind: 'ok', text: t('common.saved') }
          : { kind: 'error', text: t(res.error, res.vars) }
      );
    });
  };

  const sortedBreaks = [...breaks].sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('termBreaks.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('termBreaks.desc')}</p>
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

      {sortedBreaks.length > 0 && (
        <ul className="space-y-2 mb-4">
          {sortedBreaks.map((b) => (
            <li key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50">
              <div>
                <p className="font-medium text-gray-900 text-sm">{b.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {b.start_date} — {b.end_date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeBreak(b.id, b.row_version)}
                disabled={isPending}
                className="text-red-600 hover:text-red-800 p-2 rounded-md hover:bg-red-50 transition text-sm disabled:opacity-50"
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addBreak} className="pt-4 border-t border-gray-100 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('termBreaks.name')}
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="w-[140px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('termBreaks.start')}
          </label>
          <input
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="w-[140px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('termBreaks.end')}
          </label>
          <input
            type="date"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition text-sm font-medium h-[34px] disabled:opacity-50"
        >
          {isPending ? <Spinner /> : '+ ' + t('termBreaks.add')}
        </button>
      </form>
    </div>
  );
}
