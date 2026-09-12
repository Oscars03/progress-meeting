'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeeklyUpdateAction } from '../update-actions';

export type TaskRow = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  overdue: boolean;
  progressPct: number;
  ownerName: string;
  isMine: boolean;
  current: {
    summary: string;
    risks: string;
    nextPlan: string;
    progressPct: number;
  } | null;
  /** Weeks since the most recent update; null when there has never been one. */
  staleWeeks: number | null;
  history: { key: string; reported: boolean }[];
};

type Draft = { progressPct: number; summary: string; risks: string; nextPlan: string };

function staleLabel(row: TaskRow): { text: string; tone: string } {
  if (row.current) return { text: 'รายงานแล้ว', tone: 'bg-green-50 text-green-700' };
  if (row.staleWeeks === null)
    return { text: 'ไม่เคยรายงาน', tone: 'bg-red-50 text-red-700' };
  if (row.staleWeeks <= 1) return { text: 'ค้าง 1 สัปดาห์', tone: 'bg-amber-50 text-amber-800' };
  return { text: `เงียบ ${row.staleWeeks} สัปดาห์`, tone: 'bg-red-50 text-red-700' };
}

export default function WeeklyBoard({
  rows,
  weekKey,
  historyKeys,
}: {
  rows: TaskRow[];
  weekKey: string;
  historyKeys: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);

  const visible = onlyMine ? rows.filter((r) => r.isMine) : rows;
  const pending = visible.filter((r) => !r.current).length;

  const startEdit = (row: TaskRow) => {
    setMessage(null);
    setOpenId(row.id);
    setDraft({
      progressPct: row.current?.progressPct ?? row.progressPct,
      summary: row.current?.summary ?? '',
      risks: row.current?.risks ?? '',
      nextPlan: row.current?.nextPlan ?? '',
    });
  };

  const save = (row: TaskRow) => {
    if (!draft) return;
    if (!draft.summary.trim()) {
      setMessage({ type: 'error', text: 'กรุณากรอกสรุปความคืบหน้า' });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        await saveWeeklyUpdateAction({
          taskId: row.id,
          progressPct: draft.progressPct,
          summary: draft.summary,
          risks: draft.risks,
          nextPlan: draft.nextPlan,
          weekKey,
        });
        setOpenId(null);
        setDraft(null);
        setMessage({ type: 'ok', text: `บันทึกรายงานของ "${row.title}" แล้ว` });
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="text-sm text-gray-600">
          {visible.length === 0 ? (
            // "All reported" over an empty list reads as an achievement when in
            // fact there was nothing to report.
            <span className="text-gray-400">ไม่มีงานในมุมมองนี้</span>
          ) : pending === 0 ? (
            <span className="text-green-700 font-medium">รายงานครบทุกงานแล้ว</span>
          ) : (
            <>
              ยังไม่รายงานสัปดาห์นี้{' '}
              <span className="font-semibold text-gray-900 tabular-nums">{pending}</span> งาน
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="rounded border-gray-300"
          />
          เฉพาะงานของฉัน
        </label>
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 text-sm rounded-lg border ${
            message.type === 'ok'
              ? 'text-green-800 bg-green-50 border-green-200'
              : 'text-red-800 bg-red-50 border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="p-6 bg-white rounded-xl border border-gray-100 text-sm text-gray-400">
          {onlyMine
            ? 'ไม่มีงานที่คุณรับผิดชอบอยู่ — ลองเอาตัวกรองออกเพื่อดูงานทั้งหมด'
            : 'ยังไม่มีงานที่ค้างอยู่'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const stale = staleLabel(row);
            const editing = openId === row.id;

            return (
              <li
                key={row.id}
                className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stale.tone}`}>
                    {stale.text}
                  </span>
                  <h3 className="font-semibold text-gray-900 flex-1 min-w-48">{row.title}</h3>
                  <span className="text-xs text-gray-500">{row.ownerName}</span>
                  {row.dueDate && (
                    <span
                      className={`text-xs tabular-nums ${
                        row.overdue ? 'text-red-600 font-medium' : 'text-gray-500'
                      }`}
                    >
                      ส่ง {row.dueDate}
                    </span>
                  )}
                  <button
                    onClick={() => (editing ? setOpenId(null) : startEdit(row))}
                    className="text-sm text-blue-600 hover:underline ml-auto"
                  >
                    {editing ? 'ปิด' : row.current ? 'แก้รายงาน' : 'กรอกรายงาน'}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${row.progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
                    {row.progressPct}%
                  </span>
                  <div className="flex items-center gap-1" title="6 สัปดาห์ล่าสุด ใหม่อยู่ซ้าย">
                    {row.history.map((h) => (
                      <span
                        key={h.key}
                        aria-label={`${h.key}: ${h.reported ? 'รายงานแล้ว' : 'ไม่มีรายงาน'}`}
                        className={`w-2 h-4 rounded-sm ${
                          h.reported ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {row.current && !editing && (
                  <dl className="text-sm space-y-1 pt-2 border-t border-gray-100">
                    <div className="flex gap-2">
                      <dt className="text-gray-500 shrink-0">ทำไป:</dt>
                      <dd className="text-gray-900">{row.current.summary}</dd>
                    </div>
                    {row.current.risks && (
                      <div className="flex gap-2">
                        <dt className="text-gray-500 shrink-0">ติดปัญหา:</dt>
                        <dd className="text-amber-800">{row.current.risks}</dd>
                      </div>
                    )}
                    {row.current.nextPlan && (
                      <div className="flex gap-2">
                        <dt className="text-gray-500 shrink-0">สัปดาห์หน้า:</dt>
                        <dd className="text-gray-900">{row.current.nextPlan}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {editing && draft && (
                  <div className="pt-3 border-t border-gray-100 space-y-3">
                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`pct-${row.id}`}
                      >
                        ความคืบหน้า {draft.progressPct}%
                      </label>
                      <input
                        id={`pct-${row.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={draft.progressPct}
                        onChange={(e) =>
                          setDraft({ ...draft, progressPct: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`sum-${row.id}`}
                      >
                        สัปดาห์นี้ทำอะไรไป
                      </label>
                      <textarea
                        id={`sum-${row.id}`}
                        rows={2}
                        value={draft.summary}
                        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`risk-${row.id}`}
                      >
                        ติดปัญหาอะไร (ถ้ามี)
                      </label>
                      <textarea
                        id={`risk-${row.id}`}
                        rows={2}
                        value={draft.risks}
                        onChange={(e) => setDraft({ ...draft, risks: e.target.value })}
                        placeholder="เรื่องที่ต้องขอความช่วยเหลือในที่ประชุม"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-xs font-medium text-gray-600 mb-1"
                        htmlFor={`next-${row.id}`}
                      >
                        สัปดาห์หน้าจะทำอะไร
                      </label>
                      <textarea
                        id={`next-${row.id}`}
                        rows={2}
                        value={draft.nextPlan}
                        onChange={(e) => setDraft({ ...draft, nextPlan: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => save(row)}
                        disabled={isPending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                      >
                        {isPending ? 'กำลังบันทึก...' : 'บันทึกรายงาน'}
                      </button>
                      <span className="text-xs text-gray-500">
                        หนึ่งงานมีรายงานหนึ่งฉบับต่อสัปดาห์ — บันทึกซ้ำคือแก้ฉบับเดิม
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-400">
        แถบเล็ก 6 ช่องคือ 6 สัปดาห์ล่าสุด ({historyKeys[historyKeys.length - 1]} ถึง{' '}
        {historyKeys[0]}) ช่องทึบคือสัปดาห์ที่มีรายงาน
      </p>
    </div>
  );
}
