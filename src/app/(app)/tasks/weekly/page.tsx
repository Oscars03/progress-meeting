import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import { recentWeekKeys, weekKey, weeksAgo, weekStartDate } from '@/lib/week';
import type { TaskRecord, TaskUpdateRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import { canRecordProgress } from '@/lib/task-rights';
import WeeklyBoard, { type TaskRow } from './weekly-board';
import { getT } from '@/lib/ui/server-i18n';

/** Tasks the signed-in person is on: owner or listed assignee. */
function assigneeIds(task: TaskRecord): string[] {
  const raw = task.assignee_ids;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export default async function WeeklyPage() {
  const actor = await requireSession();
  const thisWeek = weekKey();

  const [tasks, updates, users, leads, t] = await Promise.all([
    SheetRepo.find<TaskRecord>('tasks'),
    SheetRepo.find<TaskUpdateRecord>('task_updates'),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    getT(),
  ]);

  const nameById = new Map(users.map((u) => [u.id, u.name] as const));
  const history = recentWeekKeys(6);

  const open = tasks.filter((t) => t.status !== 'done');

  const rows: TaskRow[] = open.map((task) => {
    const mine = updates.filter((u) => u.task_id === task.id);
    const current = mine.find((u) => u.week_key === thisWeek) ?? null;

    // Longest silence is what makes a stalled task visible: the last week that
    // has an update at all, however old.
    const reported = mine
      .map((u) => weeksAgo(u.week_key))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    const staleWeeks = reported.length > 0 ? reported[0] : null;

    return {
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.due_date ?? '',
      overdue: task.overdue_flag === true,
      progressPct: Math.round(Number(task.progress_pct) || 0),
      ownerName: nameById.get(task.owner_id) ?? '—',
      isMine: task.owner_id === actor.id || assigneeIds(task).includes(actor.id),
      editable: canRecordProgress(actor, task, thisWeek, leads),
      current: current
        ? {
            summary: current.summary ?? '',
            risks: current.risks ?? '',
            nextPlan: current.next_plan ?? '',
            progressPct: Math.round(Number(current.progress_pct) || 0),
          }
        : null,
      staleWeeks,
      history: history.map((key) => ({
        key,
        reported: mine.some((u) => u.week_key === key),
      })),
    };
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('weekly.title')}</h2>
          <p className="text-sm text-gray-500">
            {t('weekly.subtitle', { week: thisWeek, start: weekStartDate(thisWeek) ?? '' })}
          </p>
        </div>
        <Link
          href="/tasks"
          className="text-sm text-blue-600 hover:underline whitespace-nowrap"
        >
          {t('weekly.backToBoard')}
        </Link>
      </div>

      <WeeklyBoard rows={rows} weekKey={thisWeek} historyKeys={history} />
    </div>
  );
}
