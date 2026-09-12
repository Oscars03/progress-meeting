'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addActionItemAction,
  deleteActionItemAction,
  setActionItemStatusAction,
} from './actions';

export type Item = {
  id: string;
  title: string;
  owner_id: string;
  due_date: string;
  status: string;
  source_task_id: string;
  row_version: number;
};

type Person = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  open: 'ค้างอยู่',
  done: 'เสร็จแล้ว',
  dropped: 'ยกเลิก',
};

export default function ActionItems({
  meetingId,
  items,
  people,
  openTasks,
  canDelete,
}: {
  meetingId: string;
  items: Item[];
  people: Person[];
  openTasks: { id: string; title: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sourceTaskId, setSourceTaskId] = useState('');

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—';
  const taskTitleOf = (id: string) => openTasks.find((t) => t.id === id)?.title;

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

  const add = () => {
    if (!title.trim()) {
      setError('กรุณากรอกหัวข้องาน');
      return;
    }
    run(async () => {
      await addActionItemAction({ meetingId, title, ownerId, dueDate, sourceTaskId });
      setTitle('');
      setDueDate('');
      setSourceTaskId('');
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">งานที่มอบหมายในที่ประชุม</h3>
        <p className="text-sm text-gray-500">
          ผูกกับงานเดิมที่ค้างอยู่ได้ เพื่อให้เห็นว่าเรื่องเดียวกันถูกพูดถึงมาแล้วกี่ครั้ง
        </p>
      </div>

      {error && (
        <div
          role="status"
          className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200"
        >
          {error}
        </div>
      )}

      {items.length > 0 ? (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {items.map((item) => {
            const linked = item.source_task_id ? taskTitleOf(item.source_task_id) : undefined;
            return (
              <li key={item.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.status === 'done'
                      ? 'bg-green-50 text-green-700'
                      : item.status === 'dropped'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>

                <span className="font-medium text-gray-900 flex-1 min-w-48">{item.title}</span>

                <span className="text-xs text-gray-500">{nameOf(item.owner_id)}</span>
                {item.due_date && (
                  <span className="text-xs text-gray-500 tabular-nums">{item.due_date}</span>
                )}

                {item.source_task_id && (
                  <span
                    className="text-xs text-blue-600"
                    title={linked ?? 'งานที่อ้างถึงถูกปิดหรือถูกลบไปแล้ว'}
                  >
                    ↳ {linked ?? 'งานเดิม'}
                  </span>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {item.status !== 'done' ? (
                    <button
                      onClick={() =>
                        run(() =>
                          setActionItemStatusAction(meetingId, item.id, 'done', item.row_version)
                        )
                      }
                      disabled={isPending}
                      className="text-xs text-green-700 hover:underline disabled:opacity-50"
                    >
                      ทำเสร็จ
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        run(() =>
                          setActionItemStatusAction(meetingId, item.id, 'open', item.row_version)
                        )
                      }
                      disabled={isPending}
                      className="text-xs text-gray-500 hover:underline disabled:opacity-50"
                    >
                      กลับเป็นค้าง
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (!confirm(`ลบ "${item.title}" ถาวร?`)) return;
                        run(() => deleteActionItemAction(meetingId, item.id, item.row_version));
                      }}
                      disabled={isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">ยังไม่มีงานที่มอบหมายในการประชุมนี้</p>
      )}

      <div className="pt-3 border-t border-gray-100 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ai-title">
            หัวข้องาน
          </label>
          <input
            id="ai-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น แก้บทที่ 3 ตามที่อาจารย์แนะนำ"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ai-owner">
            ผู้รับผิดชอบ
          </label>
          <select
            id="ai-owner"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">— ไม่ระบุ —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ai-due">
            กำหนดส่ง
          </label>
          <input
            id="ai-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ai-source">
            ต่อเนื่องจากงานเดิม (ถ้ามี)
          </label>
          <select
            id="ai-source"
            value={sourceTaskId}
            onChange={(e) => setSourceTaskId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="">— งานใหม่ ไม่ต่อจากอะไร —</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <button
            onClick={add}
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {isPending ? 'กำลังเพิ่ม...' : '+ เพิ่มงานที่มอบหมาย'}
          </button>
        </div>
      </div>
    </section>
  );
}
