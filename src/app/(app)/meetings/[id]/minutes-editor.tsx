'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMinutesAction } from './actions';

export default function MinutesEditor({
  meetingId,
  initialContent,
  minutesId,
  rowVersion,
}: {
  meetingId: string;
  initialContent: string;
  minutesId: string | null;
  rowVersion: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState(initialContent);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const dirty = content !== initialContent;

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        await saveMinutesAction(meetingId, content, minutesId, rowVersion);
        setMessage({ type: 'ok', text: 'บันทึกแล้ว' });
        router.refresh();
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ',
        });
      }
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">บันทึกการประชุม (Minutes)</h3>
        {dirty && !isPending && (
          <span className="text-xs text-amber-700">ยังไม่ได้บันทึก</span>
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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={10}
        placeholder="สรุปสิ่งที่คุยกัน มติที่ประชุม และประเด็นค้าง"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={isPending || !dirty}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <p className="text-xs text-gray-500">
          หนึ่งการประชุมมีบันทึกหนึ่งฉบับ — กดบันทึกซ้ำคือแก้ฉบับเดิม
        </p>
      </div>
    </section>
  );
}
