import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';
import StatCards, { type Stat } from './stat-cards';
import DashboardTitle from './dashboard-title';

export default async function DashboardPage() {
  const tasks = await SheetRepo.find<TaskRecord>('tasks');
  const activeTasks = tasks.filter((t) => t.status !== 'done');
  const overdue = tasks.filter((t) => t.overdue_flag === true);

  // Labels are translated in the client component; the page only counts.
  const stats: Stat[] = [
    { key: 'dashboard.total', value: tasks.length },
    { key: 'dashboard.open', value: activeTasks.length },
    { key: 'dashboard.overdue', value: overdue.length, tone: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <DashboardTitle />
      <StatCards stats={stats} />
    </div>
  );
}
