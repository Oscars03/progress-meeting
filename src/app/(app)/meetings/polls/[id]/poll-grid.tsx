'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { closePollAction, confirmSlotAction, deletePollAction, voteAction } from '../actions';
import { slotConflictsAction, type SlotBusy } from '../../../calendar-actions';
import { usePrefs } from '@/lib/ui/prefs';
import { LAB_TIME_ZONE } from '@/lib/lab-time';

type Choice = 'yes' | 'maybe' | 'no';

export type SlotView = {
  id: string;
  startAt: string;
  endAt: string;
  yes: number;
  maybe: number;
  no: number;
  pending: number;
  everyoneCanMake: boolean;
  rank: number;
  isRecommended: boolean;
  myChoice: Choice | null;
  responders: { name: string; choice: Choice }[];
};

const ANSWER_LABELS: Record<Choice, string> = {
  yes: 'polls.status.yes',
  maybe: 'polls.status.maybe',
  no: 'polls.status.no',
};

const CHOICE_STYLE: Record<Choice, { on: string; off: string }> = {
  yes: {
    on: 'bg-green-600 text-white',
    off: 'bg-white text-green-700 border border-green-200 hover:bg-green-50',
  },
  maybe: {
    on: 'bg-amber-500 text-white',
    off: 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50',
  },
  no: {
    on: 'bg-red-600 text-white',
    off: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  },
};

/** "13 ก.ย. 2026, 10:00 — 11:30" with the end time shortened when same-day. */
function formatRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime())) return `${startAt} — ${endAt}`;

  // Pinned to the lab's zone rather than the reader's: this renders on the
  // server first, where "local" is UTC, and a slot that moves seven hours
  // between the first paint and hydration is both wrong and a mismatch.
  const day = { weekday: 'short', day: 'numeric', month: 'short', timeZone: LAB_TIME_ZONE } as const;
  const clock = { hour: '2-digit', minute: '2-digit', timeZone: LAB_TIME_ZONE } as const;

  const date = start.toLocaleDateString('th-TH', day);
  const from = start.toLocaleTimeString('th-TH', clock);

  if (Number.isNaN(end.getTime())) return `${date} ${from}`;

  const labDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: LAB_TIME_ZONE });
  const sameDay = labDay(start) === labDay(end);
  const to = end.toLocaleTimeString('th-TH', clock);
  return sameDay
    ? `${date} ${from} — ${to}`
    : `${date} ${from} — ${end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: LAB_TIME_ZONE })} ${to}`;
}

export default function PollGrid({
  pollId,
  pollRowVersion,
  slots,
  canManage,
  closed,
  alreadyConfirmed,
}: {
  pollId: string;
  pollRowVersion: number;
  slots: SlotView[];
  canManage: boolean;
  closed: boolean;
  alreadyConfirmed: boolean;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<Map<string, SlotBusy> | null>(null);
  const [checkingCalendars, setCheckingCalendars] = useState(false);

  /**
   * Free/busy is fetched on demand rather than with the page: it costs one
   * Google call per connected member, which is not worth spending on everybody
   * who merely opens the poll.
   */
  const checkCalendars = () => {
    setError('');
    setCheckingCalendars(true);
    startTransition(async () => {
      try {
        const result = await slotConflictsAction(
          slots.map((s) => ({ id: s.id, startAt: s.startAt, endAt: s.endAt }))
        );
        setConflicts(new Map(result.map((r) => [r.slotId, r])));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('polls.error.readCalendar'));
      } finally {
        setCheckingCalendars(false);
      }
    });
  };

  const run = (work: () => Promise<unknown>) => {
    setError('');
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error.generic'));
      }
    });
  };

  const answered = slots.filter((s) => s.myChoice !== null).length;

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="status"
          className="p-3 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200"
        >
          {error}
        </div>
      )}

      {!closed && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {t('polls.answeredCount')}{' '}
            <span className="font-semibold text-gray-900 tabular-nums">{answered}</span> {t('polls.answeredFrom')}{' '}
            <span className="tabular-nums">{slots.length}</span> {t('polls.answeredUnit')}
          </p>
          <button
            onClick={checkCalendars}
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {checkingCalendars ? t('polls.checking') : t('polls.checkCalendar')}
          </button>
        </div>
      )}

      {conflicts && (
        <p className="text-xs text-gray-400">
          {(() => {
            const checked = [...conflicts.values()][0]?.checked ?? 0;
            return checked === 0
              ? t('polls.noLinked')
              : t('polls.linkedNote', { checked });
          })()}
        </p>
      )}

      <ul className="space-y-3">
        {slots.map((slot) => (
          <li
            key={slot.id}
            className={`p-4 rounded-xl border shadow-sm space-y-3 ${
              slot.isRecommended
                ? 'bg-white border-green-200 ring-1 ring-green-200'
                : 'bg-white border-gray-100'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-sm font-semibold text-gray-500 tabular-nums w-6">
                #{slot.rank}
              </span>
              <span className="font-semibold text-gray-900 flex-1 min-w-48">
                {formatRange(slot.startAt, slot.endAt)}
              </span>

              {/* green-50, not green-100: only the shades listed in globals.css
                  are remapped for dark mode, and green-100 is not one -- it
                  stayed near-white while the text turned light green, leaving
                  the badge unreadable. */}
              {slot.isRecommended && (
                <span className="bg-green-50 text-green-800 text-xs px-2 py-0.5 rounded font-medium ml-2">
                  {t('polls.recommended')}
                </span>
              )}
              {!slot.isRecommended && slot.everyoneCanMake && (
                <span className="text-xs font-medium text-green-700 ml-2">
                  {t('polls.allAvailable')}
                </span>
              )}
              {slot.no > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700">
                  {t('polls.unavailableCount', { no: slot.no })}
                </span>
              )}
            </div>

            {conflicts?.get(slot.id)?.busyNames.length ? (
              <p className="text-xs text-amber-800">
                <span className="text-red-700">{t('polls.conflictWith', { names: conflicts.get(slot.id)!.busyNames.join(', ') })}</span>
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 tabular-nums">
              <span>{t('polls.statusCount.yes', { yes: slot.yes })}</span>
              <span>{t('polls.statusCount.maybe', { maybe: slot.maybe })}</span>
              <span>{t('polls.statusCount.no', { no: slot.no })}</span>
              {slot.pending > 0 && <span>{t('polls.statusCount.pending', { pending: slot.pending })}</span>}
            </div>

            {slot.responders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {slot.responders.map((r) => (
                  <span
                    key={r.name + r.choice}
                    title={t(ANSWER_LABELS[r.choice] as Parameters<typeof t>[0])}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      r.choice === 'yes'
                        ? 'bg-green-50 text-green-700'
                        : r.choice === 'maybe'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {r.name}
                  </span>
                ))}
              </div>
            )}

            {!closed && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                {(['yes', 'maybe', 'no'] as Choice[]).map((choice) => {
                  const active = slot.myChoice === choice;
                  const style = CHOICE_STYLE[choice];
                  return (
                    <button
                      key={choice}
                      onClick={() => run(() => voteAction(pollId, slot.id, choice))}
                      disabled={isPending}
                      aria-pressed={active}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                        active ? style.on : style.off
                      }`}
                    >
                      {t(ANSWER_LABELS[choice] as Parameters<typeof t>[0])}
                    </button>
                  );
                })}

                {canManage && !alreadyConfirmed && (
                  <button
                    onClick={() => {
                      if (!confirm(t('polls.confirmSlot', { range: formatRange(slot.startAt, slot.endAt) })))
                        return;
                      run(async () => {
                        await confirmSlotAction(pollId, pollRowVersion, slot.id);
                      });
                    }}
                    disabled={isPending}
                    className="ml-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {t('polls.confirmThis')}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {slots.length === 0 && (
        <p className="p-6 bg-white rounded-xl border border-gray-100 text-sm text-gray-400">
          {t('polls.noSlots')}
        </p>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() =>
              run(() => closePollAction(pollId, pollRowVersion, closed ? 'open' : 'closed'))
            }
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {closed ? t('polls.reopen') : t('polls.close')}
          </button>
          <button
            onClick={() => {
              if (!confirm(t('polls.confirmDelete'))) return;
              run(async () => {
                await deletePollAction(pollId, pollRowVersion);
                router.push('/meetings/polls');
              });
            }}
            disabled={isPending}
            className="px-3 py-1.5 text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            {t('polls.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
