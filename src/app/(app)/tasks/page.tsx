import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';
import KanbanBoard from './kanban';
import NewTaskButton from './new-task-button';
import { getT } from '@/lib/ui/server-i18n';

export default async function TasksPage() {
  const [tasks, t] = await Promise.all([SheetRepo.find<TaskRecord>('tasks'), getT()]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">{t('tasks.title')}</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/tasks/weekly"
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            {t('weekly.title')}
          </Link>
          <NewTaskButton />
        </div>
      </div>

      <KanbanBoard tasks={tasks} />
    </div>
  );
}
