'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pullMeetingAction, pushMeetingAction } from '../../calendar-actions';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
import type { TranslationKey } from '@/lib/ui/i18n';
import type { SyncField } from '@/lib/google/meeting-sync';

type Outcome = { ok: true; changed?: SyncField[] } | { ok: false; error: TranslationKey };

export default function CalendarSync({
  meetingId,
  linked,
  syncedAt,
  ownerName,
  canSync,
  hasUnsentChanges,
}: {
  meetingId: string;
  linked: boolean;
  syncedAt: string;
  /** Empty when the event's owner is no longer a user. */
  ownerName: string;
  /**
   * Whoever runs this meeting's week, or an admin. Pushing invites the whole
   * lab and pulling overwrites the meeting from Google, so neither is
   * something to leave lying about for any reader to press.
   */
  canSync: boolean;
  /**
   * Whether the meeting has changed since it was last sent.
   *
   * The push button is not a status light. Once the event is on the calendar
   * and nothing has changed, pressing it re-sends the same invitation to
   * everybody -- so it is not offered. It comes back on its own the moment
   * there is something new to send.
   */
  hasUnsentChanges: boolean;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<Outcome>) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(t(result.error));
          return;
        }
        const changed = result.changed;
        toast(
          changed === undefined
            ? t('sync.synced')
            : changed.length === 0
              ? t('sync.unchanged')
              : t('sync.updatedFrom', {
                  fields: changed.map((f) => t(`sync.field.${f}`)).join(', '),
                }),
        );
        router.refresh();
      } catch {
        setError(t('sync.failed'));
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

      {error && (
        <div role="alert" className="p-2.5 text-sm rounded-lg border text-red-800 bg-red-50 border-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canSync && (!linked || hasUnsentChanges) && (
          <button
            onClick={() => run(() => pushMeetingAction(meetingId))}
            disabled={isPending}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {isPending ? t('sync.syncing') : linked ? t('sync.pushChanges') : t('sync.pushInvite')}
          </button>
        )}

        {canSync && linked && (
          <button
            onClick={() => run(() => pullMeetingAction(meetingId))}
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('sync.pull')}
          </button>
        )}

        {canSync && linked && !hasUnsentChanges && (
          <span className="text-xs text-gray-500">{t('sync.upToDate')}</span>
        )}

        {syncedAt && (
          <span className="text-xs text-gray-400 tabular-nums">
            {t('sync.lastSynced', { at: syncedAt.slice(0, 16).replace('T', ' ') })}
          </span>
        )}
      </div>

      {/* The note is about pressing a button, so it is for the people who
          have one. */}
      {canSync && <p className="text-xs text-gray-400">{t('sync.manualNote')}</p>}
    </section>
  );
}
