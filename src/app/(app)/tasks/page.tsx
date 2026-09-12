import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';
import KanbanBoard from './kanban';
import NewTaskButton from './new-task-button';

export default async function TasksPage() {
  const tasks = await SheetRepo.find<TaskRecord>('tasks');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">งาน (Tasks)</h2>
        <NewTaskButton />
      </div>

      <KanbanBoard tasks={tasks} />
    </div>
  );
}
