'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { disconnectCalendarAction, type ConnectionStatus } from '../calendar-actions';

export default function CalendarCard({
  status,
  googleEnabled,
  connectedCount,
  activeCount,
}: {
  status: ConnectionStatus;
  googleEnabled: boolean;
  connectedCount: number;
  activeCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  if (!googleEnabled) {
    return (
      <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Google Calendar</h3>
        <p className="text-sm text-gray-500">
          ยังตั้งค่า Google OAuth ไม่ครบ — ต้องมี <code className="font-mono">GOOGLE_CLIENT_ID</code>{' '}
          และ <code className="font-mono">GOOGLE_CLIENT_SECRET</code> ใน .env.local
        </p>
      </section>
    );
  }

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Google Calendar</h3>
          <p className="text-sm text-gray-500">
            เชื่อมแล้วระบบจะเห็นเวลาที่คุณไม่ว่าง และลงนัดในปฏิทินของคุณได้
          </p>
        </div>
        {status.connected ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
            เชื่อมแล้ว
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            ยังไม่เชื่อม
          </span>
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

      {status.connected ? (
        <div className="space-y-3">
          <dl className="text-sm space-y-1">
            <div className="flex gap-2">
              <dt className="text-gray-500">บัญชี:</dt>
              <dd className="text-gray-900 font-mono text-xs">{status.accountEmail || '—'}</dd>
            </div>
            {status.connectedAt && (
              <div className="flex gap-2">
                <dt className="text-gray-500">เชื่อมเมื่อ:</dt>
                <dd className="text-gray-900 tabular-nums text-xs">
                  {status.connectedAt.slice(0, 16).replace('T', ' ')}
                </dd>
              </div>
            )}
          </dl>
          <button
            onClick={() => {
              if (!confirm('ยกเลิกการเชื่อมปฏิทิน? ระบบจะเลิกเห็นเวลาว่างของคุณ')) return;
              setError('');
              startTransition(async () => {
                try {
                  await disconnectCalendarAction();
                  router.refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ');
                }
              });
            }}
            disabled={isPending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            ยกเลิกการเชื่อม
          </button>
        </div>
      ) : (
        <button
          onClick={() => signIn('google', { callbackUrl: '/settings' })}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
        >
          เชื่อมบัญชี Google Calendar
        </button>
      )}

      <div className="pt-3 border-t border-gray-100 text-sm text-gray-500">
        <p>
          ในห้องแล็บนี้เชื่อมแล้ว{' '}
          <span className="font-semibold text-gray-900 tabular-nums">{connectedCount}</span> จาก{' '}
          <span className="tabular-nums">{activeCount}</span> คน
        </p>
        <p className="mt-1 text-xs text-gray-400">
          ระบบอ่านเฉพาะช่วงเวลาที่ไม่ว่าง ไม่เห็นหัวข้อหรือรายละเอียดนัดของคุณ
          และคนที่ยังไม่เชื่อมจะยังได้รับคำเชิญทางอีเมลตามปกติ
        </p>
      </div>
    </section>
  );
}
