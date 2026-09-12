'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setAgendaAction, setAttendStatusAction } from './actions';

type Person = { id: string; name: string };

export type Attendee = {
  id: string;
  user_id: string;
  attend_status: string;
  present_order: number;
  row_version: number;
};

const ATTEND_LABEL: Record<string, string> = {
  invited: 'เชิญแล้ว',
  present: 'มา',
  absent: 'ไม่มา',
  excused: 'ลา',
};

const ATTEND_CYCLE = ['invited', 'present', 'absent', 'excused'];

export default function Agenda({
  meetingId,
  people,
  attendees,
  canManage,
}: {
  meetingId: string;
  people: Person[];
  attendees: Attendee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // Local copy so reordering feels immediate; the server is the record.
  const [order, setOrder] = useState<string[]>(attendees.map((a) => a.user_id));
  const [adding, setAdding] = useState('');

  const dirty =
    order.length !== attendees.length ||
    order.some((id, i) => attendees[i]?.user_id !== id);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'ผู้ใช้ที่ถูกลบแล้ว';
  const attendeeOf = (userId: string) => attendees.find((a) => a.user_id === userId);
  const notYetInAgenda = people.filter((p) => !order.includes(p.id));

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

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  };

  const cycleAttend = (userId: string) => {
    const row = attendeeOf(userId);
    if (!row) return;
    const i = ATTEND_CYCLE.indexOf(row.attend_status);
    const next = ATTEND_CYCLE[(i + 1) % ATTEND_CYCLE.length];
    run(() => setAttendStatusAction(meetingId, row.id, next, row.row_version));
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">วาระการนำเสนอ</h3>
          <p className="text-sm text-gray-500">เรียงลำดับว่าใครนำเสนอก่อนหลัง</p>
        </div>
        {dirty && canManage && (
          <button
            onClick={() => run(() => setAgendaAction(meetingId, order))}
            disabled={isPending}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {isPending ? 'กำลังบันทึก...' : 'บันทึกลำดับ'}
          </button>
        )}
      </div>

      {error && (
        <div
          role="status"
          className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200"
        >
          {error}
        </div>
      )}

      {order.length > 0 ? (
        <ol className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {order.map((userId, index) => {
            const row = attendeeOf(userId);
            return (
              <li key={userId} className="p-3 flex flex-wrap items-center gap-3">
                <span className="w-6 text-sm font-semibold text-blue-600 tabular-nums">
                  {index + 1}
                </span>
                <span className="font-medium text-gray-900 flex-1 min-w-32">
                  {nameOf(userId)}
                </span>

                {row ? (
                  <button
                    onClick={() => cycleAttend(userId)}
                    disabled={isPending}
                    title="กดเพื่อเปลี่ยนสถานะการเข้าร่วม"
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition disabled:opacity-50 ${
                      row.attend_status === 'present'
                        ? 'bg-green-50 text-green-700'
                        : row.attend_status === 'absent'
                          ? 'bg-red-50 text-red-700'
                          : row.attend_status === 'excused'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ATTEND_LABEL[row.attend_status] ?? row.attend_status}
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">ยังไม่บันทึก</span>
                )}

                {canManage && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`เลื่อน ${nameOf(userId)} ขึ้น`}
                      className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      aria-label={`เลื่อน ${nameOf(userId)} ลง`}
                      className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setOrder(order.filter((id) => id !== userId))}
                      aria-label={`เอา ${nameOf(userId)} ออกจากวาระ`}
                      className="px-2 py-1 text-xs text-red-600 hover:underline"
                    >
                      เอาออก
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-gray-400">ยังไม่ได้จัดลำดับการนำเสนอ</p>
      )}

      {canManage && notYetInAgenda.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-gray-100">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="agenda-add">
              เพิ่มผู้นำเสนอ
            </label>
            <select
              id="agenda-add"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              <option value="">— เลือกคน —</option>
              {notYetInAgenda.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              if (!adding) return;
              setOrder([...order, adding]);
              setAdding('');
            }}
            disabled={!adding}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            เพิ่มท้ายวาระ
          </button>
        </div>
      )}

      {!canManage && (
        <p className="text-xs text-gray-400">
          ต้องมีสิทธิ์ระดับ manager ขึ้นไปจึงจะจัดลำดับได้
        </p>
      )}
    </section>
  );
}
