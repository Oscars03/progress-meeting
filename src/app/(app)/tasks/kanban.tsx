'use client';

import { useTransition } from 'react';
import { updateTaskStatus } from './actions';

const COLUMNS = [
  { id: 'draft', label: 'แบบร่าง (Draft)' },
  { id: 'assigned', label: 'มอบหมายแล้ว (Assigned)' },
  { id: 'in_progress', label: 'กำลังทำ (In Progress)' },
  { id: 'blocked', label: 'ติดปัญหา (Blocked)' },
  { id: 'ready_to_present', label: 'พร้อมนำเสนอ (Ready)' },
  { id: 'presented', label: 'นำเสนอแล้ว (Presented)' },
  { id: 'follow_up', label: 'ติดตามผล (Follow Up)' },
  { id: 'done', label: 'เสร็จสิ้น (Done)' }
];

export default function KanbanBoard({ tasks }: { tasks: any[] }) {
  const [isPending, startTransition] = useTransition();

  const handleMove = (task: any, newStatus: string) => {
    startTransition(() => {
      updateTaskStatus(task.id, newStatus, task.row_version).catch(err => {
        alert('Failed to update: ' + err.message);
      });
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(col => (
        <div key={col.id} className="min-w-[300px] bg-gray-100 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 mb-4">{col.label}</h3>
          <div className="space-y-3">
            {tasks.filter(t => t.status === col.id).map(task => (
              <div key={task.id} className="bg-white p-3 rounded shadow-sm border border-gray-200">
                <div className="font-medium mb-1">{task.title}</div>
                <div className="text-sm text-gray-500 mb-3">{task.details}</div>
                <div className="flex gap-2">
                  <select 
                    className="text-sm border rounded p-1"
                    value={task.status}
                    onChange={(e) => handleMove(task, e.target.value)}
                    disabled={isPending}
                  >
                    {COLUMNS.map(c => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
