import { SheetRepo } from '@/lib/db/sheet-repo';
import KanbanBoard from './kanban';

export default async function TasksPage() {
  const tasks = await SheetRepo.find<any>('tasks');
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">งาน (Tasks)</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
          + สร้างงานใหม่
        </button>
      </div>
      
      <KanbanBoard tasks={tasks} />
    </div>
  );
}
