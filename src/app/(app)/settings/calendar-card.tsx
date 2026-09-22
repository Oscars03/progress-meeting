'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { disconnectCalendarAction, type ConnectionStatus } from '../calendar-actions';
import Spinner from '@/lib/ui/spinner';
import { calendarAuthParams } from '@/lib/google/scopes';

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
  // Google takes the browser away, so this is never cleared: the button stays
  // spent while the redirect is in flight rather than inviting a second press.
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  // A token that is stored but failing. Distinct from never having connected:
  // the row is still there, Google just stopped honouring it.
  const broken = status.connected && Boolean(status.brokeWith);

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
        {broken ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800">
            การเชื่อมต่อหลุด
          </span>
        ) : status.connected ? (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
            เชื่อมแล้ว
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
            ยังไม่เชื่อม
          </span>
        )}
      </div>

      {/* Amber, not red: nothing is damaged and nothing was lost -- the grant
          was withdrawn on Google's side and one press puts it back. Said here
          because the alternative is finding out from a rota built on a calendar
          nobody could read. */}
      {broken && (
        <div
          role="status"
          className="p-3 text-sm bg-amber-50 border border-amber-200 rounded-lg space-y-1"
        >
          <p className="text-amber-900 font-medium">
            ระบบอ่านปฏิทินของคุณไม่ได้แล้ว — เวลาว่างของคุณจะไม่ถูกนับในตารางหาเวลา
          </p>
          <p className="text-amber-800">
            มักเกิดจากการถอนสิทธิ์ใน Google Account หรือเปลี่ยนรหัสผ่าน กดเชื่อมต่ออีกครั้งเพื่อแก้
          </p>
        </div>
      )}

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
            className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending && <Spinner className="h-3 w-3" />}
            {isPending ? 'กำลังยกเลิก...' : 'ยกเลิกการเชื่อม'}
          </button>
        </div>
      ) : (
        <button
          disabled={connecting}
          onClick={() => {
            setConnecting(true);
            // prompt=consent here, not in the provider: this is the press that
            // must come back with a refresh token, even for an account that
            // granted these scopes long ago.
            signIn('google', { callbackUrl: '/settings/account' }, calendarAuthParams());
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting && <Spinner />}
          {connecting ? 'กำลังเชื่อมต่อ...' : 'เชื่อมบัญชี Google Calendar'}
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
