'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { usePrefs } from '@/lib/ui/prefs';

const KEY = 'busyNudgeDismissed';

// "Free all week" is an answer the grid cannot record -- an empty calendar
// already means free -- so it only has to stop the asking, on this device,
// for this week. A new week asks again.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

function dismiss(week: string) {
  try {
    localStorage.setItem(KEY, week);
  } catch {
    // Blocked storage: it still goes away for this visit below.
  }
  listeners.forEach((l) => l());
}

/**
 * Asks somebody to mark the hours they cannot make, while the week's meeting
 * is still being found. Whether to ask at all is decided on the server -- see
 * lib/busy-nudge.ts; this only remembers being told "I'm free all week".
 */
export default function BusyTimeNudge({ week, canConnect }: { week: string; canConnect: boolean }) {
  const { t } = usePrefs();
  // The server cannot see what was dismissed, so it renders nothing and the
  // card appears once the browser has checked. A card that flashed up and
  // vanished on every load for those who dismissed it would be worse.
  const dismissed = useSyncExternalStore(subscribe, read, () => week);
  if (dismissed === week) return null;

  return (
    <section className="p-5 sm:p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
      <div>
        <h3 className="font-semibold text-amber-900">{t('busyNudge.title')}</h3>
        <p className="text-sm text-amber-800">{t('busyNudge.hint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/meetings"
          className="btn btn-primary btn-lg"
        >
          {t('busyNudge.go')}
        </Link>
        {canConnect && (
          <Link href="/settings/account" className="text-sm text-blue-600 hover:underline">
            {t('busyNudge.connect')}
          </Link>
        )}
        <button
          type="button"
          onClick={() => dismiss(week)}
          className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
        >
          {t('busyNudge.dismiss')}
        </button>
      </div>
    </section>
  );
}
