'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTask, updateTaskStatus } from './actions';
import { TASK_STATUSES, readStatus } from './statuses';
import { usePrefs } from '@/lib/ui/prefs';
import type { TaskRecord, UserRecord } from '@/lib/db/schema';

export default function KanbanBoard({ 
  tasks,
  users = [],
  currentUserId = '',
  canAssign = false
}: { 
  tasks: TaskRecord[],
  users?: UserRecord[],
  currentUserId?: string,
  canAssign?: boolean
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const columns = TASK_STATUSES.map((id) => ({ id, label: t(`tasks.status.${id}`) }));
  const userMap = new Map(users.map(u => [u.id, u.name]));

  const handleDelete = (task: TaskRecord) => {
    // The weekly reports written about it go too, so the confirm says so
    // rather than letting that be a surprise.
    if (!confirm(t('tasks.confirmDelete', { title: task.title }))) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTask(task.id, task.row_version);
      if (res.ok) router.refresh();
      else setError(t(res.error, res.vars));
    });
  };

  const handleMove = (task: TaskRecord, newStatus: string) => {
    setError(null);
    setMovingId(task.id);

    // Awaited inside the transition so isPending tracks the real request.
    startTransition(async () => {
      try {
        const res = await updateTaskStatus(task.id, newStatus, task.row_version);
        if (res.ok) router.refresh();
        else setError(t(res.error, res.vars));
      } catch {
        setError(t('error.generic'));
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
        {columns.map((col) => {
          const inColumn = tasks.filter((task) => readStatus(task.status) === col.id);
          return (
            <div key={col.id} className="min-w-[300px] bg-gray-100 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-4 flex items-center justify-between">
                <span>{col.label}</span>
                <span className="text-xs font-normal text-gray-500 tabular-nums">
                  {inColumn.length}
                </span>
              </h3>
              <div className="space-y-3">
                {inColumn.map((task) => {
                  const assignees = Array.isArray(task.assignee_ids) ? task.assignee_ids : (task.assignee_ids ? [task.assignee_ids as string] : []);
                  const editable = canAssign || assignees.includes(currentUserId);
                  // Narrower than editing: work somebody else put on your list
                  // is not yours to make disappear.
                  const removable = canAssign || task.owner_id === currentUserId;
                  const assigneeNames = assignees.map(id => userMap.get(id)).filter(Boolean).join(', ');
                  
                  let overdue = false;
                  if (task.due_date && readStatus(task.status) !== 'done') {
                    const due = new Date(task.due_date);
                    const now = new Date();
                    due.setHours(0,0,0,0);
                    now.setHours(0,0,0,0);
                    overdue = due < now;
                  }

                  return (
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
                      
                      {task.due_date && (
                        <div className={`text-xs mb-1 font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                          {t('tasks.due')}: {task.due_date} {overdue && t('tasks.overdue')}
                        </div>
                      )}
                      {assigneeNames && (
                        <div className="text-xs text-gray-500 mb-3">
                          {t('tasks.assignees')}: {assigneeNames}
                        </div>
                      )}

                      <select
                        className="text-sm border rounded p-1 w-full"
                        value={readStatus(task.status)}
                        onChange={(e) => handleMove(task, e.target.value)}
                        disabled={isPending || !editable}
                        aria-label={t('tasks.changeStatusOf', { title: task.title })}
                      >
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>

                      {removable && (
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          disabled={isPending}
                          className="mt-2 text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  );
                })}
                {inColumn.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">{t('tasks.emptyColumn')}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
