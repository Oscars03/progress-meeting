'use client';

import InfoTip from '@/lib/ui/info-tip';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMyCalendarsAction } from '../calendar-actions';
import type { OwnCalendar } from '@/lib/google/calendar';

/**
 * Which of your Google calendars count as busy.
 *
 * Google keeps lessons, TA duties and the like on calendars of their own, and
 * the app used to read only the main one, so a duty on "TA" left the person
 * looking free. The main calendar always counts; the rest are ticked here.
 */
export default function MyCalendars({ calendars, counted }: { calendars: OwnCalendar[] | null; counted: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(counted);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!calendars) {
    return <p className="text-sm text-gray-500">อ่านรายชื่อปฏิทินจาก Google ไม่ได้ในตอนนี้ ลองโหลดหน้าใหม่อีกครั้ง</p>;
  }

  const dirty =
    picked.length !== counted.length || picked.some((id) => !counted.includes(id));

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveMyCalendarsAction(picked);
      setMessage(res.ok ? { ok: true, text: 'บันทึกแล้ว' } : { ok: false, text: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' });
      if (res.ok) router.refresh();
    });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
        ปฏิทินที่นับว่าไม่ว่าง
        <InfoTip>ติ๊กปฏิทินที่มีนัดซึ่งทำให้คุณไม่ว่าง เช่น สอน TA หรือเรียน ปฏิทินหลักนับเสมอ</InfoTip>
      </legend>
      <ul className="space-y-1.5">
        {calendars.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-2 text-sm text-gray-900">
              <input
                type="checkbox"
                checked={c.primary || picked.includes(c.id)}
                disabled={c.primary || pending}
                onChange={(e) =>
                  setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((id) => id !== c.id)))
                }
              />
              <span className="break-all">{c.name}</span>
              {c.primary && <span className="text-xs text-gray-500">(ปฏิทินหลัก)</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={save} disabled={!dirty || pending} className="btn btn-primary btn-sm">
          {pending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        {message && (
          <span role="status" className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </fieldset>
  );
}
