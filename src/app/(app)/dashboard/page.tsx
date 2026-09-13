import { SheetRepo } from '@/lib/db/sheet-repo';
import type { TaskRecord } from '@/lib/db/schema';
import { getT } from '@/lib/ui/server-i18n';

export default async function DashboardPage() {
  const [tasks, t] = await Promise.all([SheetRepo.find<TaskRecord>('tasks'), getT()]);
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  const overdue = tasks.filter((task) => task.overdue_flag === true);

  const stats = [
    { label: t('dashboard.total'), value: tasks.length, tone: '' },
    { label: t('dashboard.open'), value: activeTasks.length, tone: '' },
    { label: t('dashboard.overdue'), value: overdue.length, tone: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 font-medium">{s.label}</h3>
            <p className={`text-3xl font-bold mt-2 tabular-nums ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
