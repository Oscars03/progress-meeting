'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pullMeetingAction, pushMeetingAction } from '../../calendar-actions';

export default function CalendarSync({
  meetingId,
  linked,
  syncedAt,
  ownerName,
}: {
  meetingId: string;
  linked: boolean;
  syncedAt: string;
  ownerName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const run = (work: () => Promise<{ ok: boolean; message?: string; changed?: string[] }>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (result.ok) {
          const changed = result.changed;
          setMessage({
            type: 'ok',
            text:
              changed === undefined
                ? 'ซิงก์กับ Google Calendar แล้ว'
                : changed.length === 0
                  ? 'ตรงกันอยู่แล้ว ไม่มีอะไรเปลี่ยน'
                  : `อัปเดตจากปฏิทิน: ${changed.join(', ')}`,
          });
          router.refresh();
        } else {
          setMessage({ type: 'error', text: result.message ?? 'ซิงก์ไม่สำเร็จ' });
        }
      } catch (err) {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'ซิงก์ไม่สำเร็จ' });
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
              ? `อยู่ในปฏิทินของ ${ownerName} และเชิญสมาชิกทุกคนแล้ว`
              : 'ยังไม่ได้ส่งขึ้นปฏิทิน'}
          </p>
        </div>
        {linked ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
            ผูกแล้ว
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            ยังไม่ผูก
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
          {isPending ? 'กำลังซิงก์...' : linked ? 'ส่งการแก้ไขขึ้นปฏิทิน' : 'ส่งขึ้นปฏิทินและเชิญทุกคน'}
        </button>

        {linked && (
          <button
            onClick={() => run(() => pullMeetingAction(meetingId))}
            disabled={isPending}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            ดึงการแก้ไขจากปฏิทิน
          </button>
        )}

        {syncedAt && (
          <span className="text-xs text-gray-400 tabular-nums">
            ซิงก์ล่าสุด {syncedAt.slice(0, 16).replace('T', ' ')}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400">
        การซิงก์ยังต้องกดเอง — ให้ Google แจ้งเตือนกลับมาอัตโนมัติได้ต่อเมื่อระบบอยู่บนเซิร์ฟเวอร์
        ที่มี URL สาธารณะ
      </p>
    </section>
  );
}
