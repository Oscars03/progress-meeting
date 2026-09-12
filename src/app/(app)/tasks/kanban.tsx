'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskStatus } from './actions';
import { TASK_STATUSES } from './statuses';
import type { TaskRecord } from '@/lib/db/schema';

const COLUMN_LABELS: Record<string, string> = {
  draft: 'แบบร่าง (Draft)',
  assigned: 'มอบหมายแล้ว (Assigned)',
  in_progress: 'กำลังทำ (In Progress)',
  blocked: 'ติดปัญหา (Blocked)',
  ready_to_present: 'พร้อมนำเสนอ (Ready)',
  presented: 'นำเสนอแล้ว (Presented)',
  follow_up: 'ติดตามผล (Follow Up)',
  done: 'เสร็จสิ้น (Done)',
};

const COLUMNS = TASK_STATUSES.map((id) => ({ id, label: COLUMN_LABELS[id] ?? id }));

export default function KanbanBoard({ tasks }: { tasks: TaskRecord[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMove = (task: TaskRecord, newStatus: string) => {
    setError(null);
    setMovingId(task.id);

    // Awaited inside the transition so isPending tracks the real request.
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, newStatus, task.row_version);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ย้ายสถานะไม่สำเร็จ');
      } finally {
        setMovingId(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <div
          className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const inColumn = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="min-w-[300px] bg-gray-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center justify-between">
                <span>{col.label}</span>
                <span className="text-xs font-normal text-gray-500 tabular-nums">
                  {inColumn.length}
                </span>
              </h3>
              <div className="space-y-3">
                {inColumn.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-white p-3 rounded shadow-sm border border-gray-200 transition-opacity ${
                      movingId === task.id ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="font-medium mb-1">{task.title}</div>
                    {task.details && (
                      <div className="text-sm text-gray-500 mb-3">{task.details}</div>
                    )}
                    <select
                      className="text-sm border rounded p-1 w-full"
                      value={task.status}
                      onChange={(e) => handleMove(task, e.target.value)}
                      disabled={isPending}
                      aria-label={`เปลี่ยนสถานะของ ${task.title}`}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {inColumn.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">ไม่มีงานในคอลัมน์นี้</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
