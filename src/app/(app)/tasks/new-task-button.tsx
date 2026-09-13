'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTask } from './actions';
import { usePrefs } from '@/lib/ui/prefs';

export default function NewTaskButton() {
  const { t } = usePrefs();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  const reset = () => {
    setTitle('');
    setDetails('');
    setDueDate('');
    setPriority('medium');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await createTask({ title, details, due_date: dueDate, priority });
        if (!res.ok) {
          setError(t(res.error, res.vars));
          return;
        }
        reset();
        setOpen(false);
        router.refresh();
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
      >
        {t('tasks.new')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('tasks.newTitle')}</h3>

            {error && (
              <div
                className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="task-title">
                  {t('tasks.name')}
                </label>
                <input
                  id="task-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('tasks.namePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1" htmlFor="task-details">
                  {t('tasks.details')}
                </label>
                <textarea
                  id="task-details"
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1" htmlFor="task-due">
                    {t('tasks.due')}
                  </label>
                  <input
                    id="task-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" htmlFor="task-priority">
                    {t('tasks.priority')}
                  </label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="low">{t('tasks.priority.low')}</option>
                    <option value="medium">{t('tasks.priority.medium')}</option>
                    <option value="high">{t('tasks.priority.high')}</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? t('common.saving') : t('tasks.saveTask')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
