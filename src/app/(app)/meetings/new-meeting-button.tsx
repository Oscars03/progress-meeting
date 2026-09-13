'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMeeting } from './actions';
import { usePrefs } from '@/lib/ui/prefs';

export default function NewMeetingButton() {
  const { t } = usePrefs();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [meetLink, setMeetLink] = useState('');

  const reset = () => {
    setTitle('');
    setStartAt('');
    setEndAt('');
    setLocation('');
    setMeetLink('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await createMeeting({
          title,
          start_at: startAt,
          end_at: endAt,
          location,
          meet_link: meetLink,
        });
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
        className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition whitespace-nowrap"
      >
        {t('meetings.new')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('meetings.newTitle')}</h3>

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
                <label className="block text-gray-600 mb-1" htmlFor="m-title">
                  {t('meetings.topic')}
                </label>
                <input
                  id="m-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('meetings.topicPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1" htmlFor="m-start">
                    {t('meetings.start')}
                  </label>
                  <input
                    id="m-start"
                    type="datetime-local"
                    required
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" htmlFor="m-end">
                    {t('meetings.end')}
                  </label>
                  <input
                    id="m-end"
                    type="datetime-local"
                    required
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1" htmlFor="m-location">
                  {t('meetings.location')}
                </label>
                <input
                  id="m-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('meetings.locationPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1" htmlFor="m-link">
                  {t('meetings.link')}
                </label>
                <input
                  id="m-link"
                  type="url"
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isPending ? t('common.saving') : t('meetings.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
