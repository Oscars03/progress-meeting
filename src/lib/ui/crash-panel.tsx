'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePrefs } from './prefs';
import { reportClientError } from '../client-log';

/**
 * What somebody sees when a page throws, instead of Next's bare
 * "Application error" screen.
 *
 * An error with a digest came from the server, which has logged it already
 * (instrumentation.ts) -- the digest is shown so a person can quote it and the
 * admin can find the row. One without a digest happened here in the browser,
 * where nothing else will have seen it, so it is reported from here.
 */
export function CrashPanel({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = usePrefs();

  useEffect(() => {
    if (!error.digest) reportClientError(error, { source: 'boundary' });
  }, [error]);

  return (
    <div role="alert" className="max-w-xl mx-auto my-8 p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">{t('crash.title')}</h2>
      <p className="text-sm text-gray-600">{t('crash.body')}</p>
      {error.digest && (
        <p className="text-xs text-gray-500">
          {t('crash.reference')}: <code className="font-mono select-all">{error.digest}</code>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          {t('crash.retry')}
        </button>
        <Link
          href="/feedback"
          className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-medium hover:bg-gray-100"
        >
          {t('crash.report')}
        </Link>
      </div>
    </div>
  );
}
