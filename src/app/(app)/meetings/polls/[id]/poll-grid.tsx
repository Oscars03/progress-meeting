'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { closePollAction, confirmSlotAction, deletePollAction, voteAction } from '../actions';

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

const CHOICE_LABEL: Record<Choice, string> = {
  yes: 'ว่าง',
  maybe: 'ได้แต่ไม่สะดวก',
  no: 'ไม่ว่าง',
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

  const date = start.toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const from = start.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  if (Number.isNaN(end.getTime())) return `${date} ${from}`;

  const sameDay = start.toDateString() === end.toDateString();
  const to = end.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return sameDay
    ? `${date} ${from} — ${to}`
    : `${date} ${from} — ${end.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${to}`;
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const run = (work: () => Promise<void>) => {
    setError('');
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ดำเนินการไม่สำเร็จ');
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
        <p className="text-sm text-gray-600">
          คุณตอบแล้ว{' '}
          <span className="font-semibold text-gray-900 tabular-nums">{answered}</span> จาก{' '}
          <span className="tabular-nums">{slots.length}</span> ช่วง
        </p>
      )}

      <ul className="space-y-3">
        {slots.map((slot) => (
          <li
            key={slot.id}
            className={`p-4 rounded-xl border shadow-sm space-y-3 ${
              slot.isRecommended
                ? 'bg-white border-green-300 ring-1 ring-green-200'
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

              {slot.isRecommended && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                  แนะนำ
                </span>
              )}
              {!slot.isRecommended && slot.everyoneCanMake && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                  ทุกคนมาได้
                </span>
              )}
              {slot.no > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700">
                  มาไม่ได้ {slot.no} คน
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 tabular-nums">
              <span>ว่าง {slot.yes}</span>
              <span>ไม่สะดวก {slot.maybe}</span>
              <span>ไม่ว่าง {slot.no}</span>
              {slot.pending > 0 && <span>ยังไม่ตอบ {slot.pending}</span>}
            </div>

            {slot.responders.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {slot.responders.map((r) => (
                  <span
                    key={r.name + r.choice}
                    title={CHOICE_LABEL[r.choice]}
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
                      {CHOICE_LABEL[choice]}
                    </button>
                  );
                })}

                {canManage && !alreadyConfirmed && (
                  <button
                    onClick={() => {
                      if (!confirm(`ยืนยันช่วง ${formatRange(slot.startAt, slot.endAt)} เป็นการประชุม?`))
                        return;
                      run(async () => {
                        await confirmSlotAction(pollId, pollRowVersion, slot.id);
                      });
                    }}
                    disabled={isPending}
                    className="ml-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    ยืนยันช่วงนี้
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {slots.length === 0 && (
        <p className="p-6 bg-white rounded-xl border border-gray-100 text-sm text-gray-400">
          โพลนี้ไม่มีช่วงเวลา
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
            {closed ? 'เปิดรับคำตอบอีกครั้ง' : 'ปิดรับคำตอบ'}
          </button>
          <button
            onClick={() => {
              if (!confirm('ลบโพลนี้พร้อมคำตอบทั้งหมดถาวร?')) return;
              run(async () => {
                await deletePollAction(pollId, pollRowVersion);
                router.push('/meetings/polls');
              });
            }}
            disabled={isPending}
            className="px-3 py-1.5 text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            ลบโพล
          </button>
        </div>
      )}
    </div>
  );
}
