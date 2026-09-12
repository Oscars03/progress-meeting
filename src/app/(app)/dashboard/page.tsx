import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';

export default async function DashboardPage() {
  const tasks = await SheetRepo.find<TaskRecord>('tasks');
  const activeTasks = tasks.filter((t) => t.status !== 'done');
  const overdue = tasks.filter((t) => t.overdue_flag === true);

  const cards = [
    { label: 'งานทั้งหมด', value: tasks.length, tone: '' },
    { label: 'งานที่ยังไม่เสร็จ', value: activeTasks.length, tone: '' },
    { label: 'งานที่เกินกำหนด', value: overdue.length, tone: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">ภาพรวม (Dashboard)</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 font-medium">{c.label}</h3>
            <p className={`text-3xl font-bold mt-2 tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
