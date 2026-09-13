'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pullMeetingAction, pushMeetingAction } from '../../calendar-actions';
import { usePrefs } from '@/lib/ui/prefs';
import type { TranslationKey } from '@/lib/ui/i18n';
import type { SyncField } from '@/lib/google/meeting-sync';

type Outcome = { ok: true; changed?: SyncField[] } | { ok: false; error: TranslationKey };

export default function CalendarSync({
  meetingId,
  linked,
  syncedAt,
  ownerName,
}: {
  meetingId: string;
  linked: boolean;
  syncedAt: string;
  /** Empty when the event's owner is no longer a user. */
  ownerName: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const run = (work: () => Promise<Outcome>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setMessage({ type: 'error', text: t(result.error) });
          return;
        }
        const changed = result.changed;
        setMessage({
          type: 'ok',
          text:
            changed === undefined
              ? t('sync.synced')
              : changed.length === 0
                ? t('sync.unchanged')
                : t('sync.updatedFrom', {
                    fields: changed.map((f) => t(`sync.field.${f}`)).join(', '),
                  }),
        });
        router.refresh();
      } catch {
        setMessage({ type: 'error', text: t('sync.failed') });
      }
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Google Calendar</h3>
          <p className="text-sm text-gray-500">
            {linked
              ? t('sync.linkedTo', { owner: ownerName || t('meeting.eventCreator') })
              : t('sync.notPushed')}
          </p>
        </div>
        {linked ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
            {t('sync.linked')}
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            {t('sync.unlinked')}
          </span>
        )}
      </div>

      {message && (
        <div
          role="status"
          className={`p-2.5 text-sm rounded-lg border ${
            message.type === 'ok'
              ? 'text-green-800 bg-green-50 border-green-200'
              : 'text-red-800 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => run(() => pushMeetingAction(meetingId))}
          disabled={isPending}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {isPending ? t('sync.syncing') : linked ? t('sync.pushChanges') : t('sync.pushInvite')}
        </button>

        {linked && (
          <button
            onClick={() => run(() => pullMeetingAction(meetingId))}
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('sync.pull')}
          </button>
        )}

        {syncedAt && (
          <span className="text-xs text-gray-400 tabular-nums">
            {t('sync.lastSynced', { at: syncedAt.slice(0, 16).replace('T', ' ') })}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">{t('sync.manualNote')}</p>
    </section>
  );
}
