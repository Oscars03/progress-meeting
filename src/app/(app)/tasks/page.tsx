import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';
import KanbanBoard from './kanban';
import NewTaskButton from './new-task-button';

export default async function TasksPage() {
  const tasks = await SheetRepo.find<TaskRecord>('tasks');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">งาน (Tasks)</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/tasks/weekly"
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            รายงานรายสัปดาห์
          </Link>
          <NewTaskButton />
        </div>
      </div>

      <KanbanBoard tasks={tasks} />
    </div>
  );
}
