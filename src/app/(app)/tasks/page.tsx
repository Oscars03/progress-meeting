import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import { actsAsWeekLead } from '@/lib/rotation';
import { weekKey } from '@/lib/week';
import KanbanBoard from './kanban';
import NewTaskButton from './new-task-button';
import { getT } from '@/lib/ui/server-i18n';
import { requireSession } from '@/lib/auth-guard';
import { canAddOwnWork, canAssignWork } from '@/lib/task-rights';
import { labMembers } from '@/lib/members';

export default async function TasksPage() {
  const actor = await requireSession();
  const [tasks, users, leads, t] = await Promise.all([
    SheetRepo.find<TaskRecord>('tasks'),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    getT()
  ]);

  const canAssign = canAssignWork(actor);
  // Tidying the board is part of preparing the meeting that reads from it, so
  // whoever is running this week can clear work as well as its owner can.
  const isLeadThisWeek = actsAsWeekLead(actor, leads, weekKey());

  // Admin runs the app; it is not somebody work gets handed to, and it was
  // still in this picker after the same rule was applied everywhere else.
  const members = labMembers(users);
  // Only a professor can be named as having asked for something.
  const professors = members.filter((u) => u.role === 'professor');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('tasks.title')}</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/tasks/weekly"
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            {t('weekly.title')}
          </Link>
          {canAddOwnWork(actor) && (
            <NewTaskButton users={members} professors={professors} canAssign={canAssign} />
          )}
        </div>
      </div>

      <KanbanBoard
        tasks={tasks}
        users={members}
        currentUserId={actor.id}
        canAssign={canAssign}
        canRemoveAny={actor.role === 'admin'}
        isLeadThisWeek={isLeadThisWeek}
      />
    </div>
  );
}
