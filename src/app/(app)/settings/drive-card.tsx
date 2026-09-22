'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';
import { driveAuthParams } from '@/lib/google/scopes';
import type { DriveStatus } from '@/lib/google/drive';

/**
 * Where the lab's Drive is connected, for the pictures people send with their
 * feedback.
 *
 * One connection for the whole lab, not one per person: the files live on the
 * account named by LAB_DRIVE_EMAIL, and everybody else simply uploads to it.
 * Admin only, because connecting it is a decision about where the lab's data
 * is kept rather than a personal setting.
 *
 * Pressing this signs the browser in to Google again, so the account chooser
 * has to land on the lab's account -- which is why the address is spelled out
 * above the button rather than left to be remembered.
 */
export default function DriveCard({ status }: { status: DriveStatus }) {
  const { t } = usePrefs();
  // Google takes the browser away, so this is never cleared: the button stays
  // spent while the redirect is in flight.
  const [connecting, setConnecting] = useState(false);

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('drive.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('drive.subtitle')}</p>
      </div>

      {!status.account ? (
        <p className="p-3 text-sm rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
          {t('drive.noAccountConfigured')}
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-700">
            {t('drive.account')}{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">{status.account}</code>
          </p>

          {status.connected ? (
            <p className="p-3 text-sm rounded-lg border bg-green-50 text-green-800 border-green-200">
              {t('drive.connected')}
            </p>
          ) : (
            <p className="p-3 text-sm rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
              {/* "Broke" and "never set up" are different problems and send
                  somebody looking in different places. */}
              {status.brokeWith ? t('drive.broke') : t('drive.notConnected')}
            </p>
          )}

          <button
            type="button"
            disabled={connecting}
            onClick={() => {
              setConnecting(true);
              signIn('google', { callbackUrl: '/settings/lab' }, driveAuthParams());
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {connecting && <Spinner className="h-4 w-4" />}
            {status.connected ? t('drive.reconnect') : t('drive.connect')}
          </button>

          <p className="text-xs text-gray-500">{t('drive.chooseAccountHint')}</p>
        </>
      )}
    </div>
  );
}
